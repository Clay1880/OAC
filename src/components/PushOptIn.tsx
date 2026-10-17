"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";

type Mode = "checking" | "hidden" | "ios-install" | "ask" | "on" | "blocked";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** "default" means the student has not been asked yet. The Permissions API is asked first because some browsers (headless Chromium) misreport Notification.permission. */
async function notificationPermission(): Promise<NotificationPermission> {
  try {
    const { state } = await navigator.permissions.query({ name: "notifications" });
    return state === "prompt" ? "default" : state;
  } catch {
    return Notification.permission;
  }
}

async function saveSubscription(subscription: PushSubscription) {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error("subscribe failed");
}

/**
 * Offers "ready" alerts. It is only rendered once the student has an order, so the browser's
 * permission prompt arrives with a reason. iPhones only support push from an installed app, so
 * there it explains how to install instead of showing a button that cannot work.
 */
export function PushOptIn() {
  const [mode, setMode] = useState<Mode>("checking");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;
    const set = (next: Mode) => {
      if (!cancelled) setMode(next);
    };

    async function detect() {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      const installed =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (isIOS && !installed) return set("ios-install");

      if (!VAPID_PUBLIC_KEY || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return set("hidden");
      }
      const permission = await notificationPermission();
      if (permission === "denied") return set("blocked");

      // Offer the button straight away; an existing subscription only upgrades it to "on".
      set("ask");
      if (permission !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (!existing) return;
      // Re-send it: the endpoint may have moved to this account (shared phone) or been pruned.
      saveSubscription(existing).catch(() => {});
      set("on");
    }

    detect().catch(() => {
      // Detection failed after the button was offered; leave it, enabling reports its own errors.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMode(permission === "denied" ? "blocked" : "ask");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
        }));
      await saveSubscription(subscription);
      setMode("on");
    } catch {
      toast({ title: "Could not turn on ready alerts.", description: "This page still shows your order live.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  if (mode === "checking" || mode === "hidden") return null;

  return (
    <Card className="p-4">
      {mode === "ask" && (
        <div className="flex flex-col gap-3">
          <p className="text-ink-soft">Get a buzz on your phone the moment your order is ready.</p>
          <Button variant="secondary" fullWidth loading={busy} onClick={enable}>
            Turn on ready alerts
          </Button>
        </div>
      )}
      {mode === "on" && <p className="font-semibold text-status-ready-ink">Ready alerts are on.</p>}
      {mode === "blocked" && (
        <p className="text-ink-soft">
          Notifications are blocked for OAC. Allow them in your browser settings if you want an alert when your
          order is ready.
        </p>
      )}
      {mode === "ios-install" && (
        <div>
          <p className="font-semibold">Add to Home Screen to get ready alerts</p>
          <p className="mt-1 text-ink-soft">
            Tap the Share button in Safari, then Add to Home Screen, and open OAC from there. Until then, this
            page shows your order live.
          </p>
        </div>
      )}
    </Card>
  );
}
