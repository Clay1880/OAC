import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type Payload = { title: string; body: string; url: string };

/** The push service says the subscription no longer exists (uninstalled, permission revoked). */
const isGone = (error: unknown) => {
  const status = (error as { statusCode?: number } | null)?.statusCode;
  return status === 404 || status === 410;
};

/**
 * Sends a Web Push to every device a user has subscribed. Never throws: a failed or missing push
 * must not fail the staff action that triggered it, and the student still sees "Ready" on the
 * order page. Subscriptions the push service reports gone (404/410) are deleted.
 */
export async function sendPushToUser(userId: string, payload: Payload): Promise<void> {
  // Staff are waiting on "Mark ready": a slow push service or database must not hold them up.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, PUSH_TIMEOUT_MS);
  });
  try {
    await Promise.race([deliver(userId, payload), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const PUSH_TIMEOUT_MS = 8_000;

async function deliver(userId: string, payload: Payload): Promise<void> {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return; // not configured: push is simply off

    // Service role: RLS lets a user read only their own subscriptions, and this runs for staff.
    const db = createAdminClient();
    const { data: subscriptions } = await db
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", userId);
    if (!subscriptions?.length) return;

    webpush.setVapidDetails(subject, publicKey, privateKey);
    const body = JSON.stringify(payload);

    await Promise.allSettled(
      subscriptions.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
            TTL: 60 * 60,
            urgency: "high",
          });
        } catch (error) {
          if (isGone(error)) await db.from("push_subscriptions").delete().eq("id", s.id);
        }
      }),
    );
  } catch {
    // Deliberately swallowed, see above.
  }
}
