import { buttonStyles } from "@/components/ui/Button";

export const metadata = { title: "Offline" };

/** Served by the service worker when the network is down. Static on purpose: no session, no data. */
export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <p className="font-display text-lg font-bold tracking-tight text-brand">OAC</p>
      <h1 className="text-2xl font-bold text-balance">You are offline</h1>
      <p className="text-lg text-ink-soft text-pretty">
        Your orders are safe. Reconnect to place a new order or see where your current one stands. If you
        already placed one, show your order ID at the counter.
      </p>
      {/* A plain anchor on purpose: this page is served from cache, where client-side routing may have no JS. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className={buttonStyles({ size: "lg", fullWidth: true })}>
        Try again
      </a>
    </main>
  );
}
