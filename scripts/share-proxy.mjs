// One public door for the whole app, so a single ngrok tunnel is enough.
//
//   node scripts/share-proxy.mjs          (then: ngrok http 8088 --url=<your-domain>)
//
// Visitors' phones cannot reach this PC's local Supabase (127.0.0.1:54321), so the app's browser code
// is built to call https://<your-domain>/sb instead. This proxy sends:
//   /sb/...  ->  local Supabase API (prefix removed), including the Realtime websocket
//   others   ->  the Next.js app (npx next start -p 3200)
// Only Node built-ins; headers pass through untouched so Next sees the public host name.
import http from "node:http";
import net from "node:net";

const PORT = Number(process.env.PROXY_PORT ?? 8088);
const APP = { host: "127.0.0.1", port: Number(process.env.APP_PORT ?? 3200) };
const SUPABASE = { host: "127.0.0.1", port: Number(process.env.SUPABASE_PORT ?? 54321) };

/** Picks the upstream and the path it should receive. */
function route(url = "/") {
  if (url === "/sb" || url.startsWith("/sb/") || url.startsWith("/sb?")) {
    return { target: SUPABASE, path: url.slice(3) || "/" };
  }
  return { target: APP, path: url };
}

const server = http.createServer((req, res) => {
  const { target, path } = route(req.url);
  const upstream = http.request(
    { host: target.host, port: target.port, method: req.method, path, headers: req.headers },
    (upRes) => {
      res.writeHead(upRes.statusCode ?? 502, upRes.statusMessage, upRes.headers);
      upRes.pipe(res);
    },
  );
  upstream.on("error", (error) => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end(`Bad gateway: ${target.port === APP.port ? "the app" : "Supabase"} is not answering on port ${target.port} (${error.code ?? error.message}).`);
  });
  req.pipe(upstream);
});

// Websockets (Supabase Realtime): replay the upgrade request to the upstream, then pipe both ways.
server.on("upgrade", (req, socket, head) => {
  const { target, path } = route(req.url);
  const upstream = net.connect(target.port, target.host, () => {
    let raw = `${req.method} ${path} HTTP/${req.httpVersion}\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    upstream.write(`${raw}\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  const close = () => {
    socket.destroy();
    upstream.destroy();
  };
  upstream.on("error", close);
  socket.on("error", close);
  socket.on("close", close);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Proxy on http://127.0.0.1:${PORT}  (/sb -> :${SUPABASE.port}, everything else -> :${APP.port})`);
});
