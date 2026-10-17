import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

const text = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Push endpoints are HTTPS URLs; anything else is not a push service. */
const isHttpsUrl = (value: string) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Stores the browser's PushSubscriptionJSON for the signed-in user. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!text(endpoint) || !text(p256dh) || !text(auth) || !isHttpsUrl(endpoint)) {
    return NextResponse.json({ error: "That is not a push subscription." }, { status: 400 });
  }

  // The RPC moves the endpoint to whoever is signed in now (a shared phone) instead of failing.
  const { error } = await supabase.rpc("upsert_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
  });
  if (error) {
    const status = error.message.includes("FORBIDDEN") ? 403 : error.message.includes("INVALID_SUBSCRIPTION") ? 400 : 500;
    return NextResponse.json({ error: "Could not save the subscription." }, { status });
  }
  return NextResponse.json({ ok: true });
}
