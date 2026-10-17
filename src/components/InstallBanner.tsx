"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type InstallEvent = Event & { prompt: () => Promise<void> };
type Mode = "hidden" | "chromium" | "ios";

const DISMISSED_KEY = "oac.install.dismissed";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isIosSafari = () => {
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return apple && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
};

const wasDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Offers to install the app: Chromium's own prompt where the browser supports it, and
 * Add-to-Home-Screen directions on iPhones, which have no install API. Hidden once installed
 * or dismissed, so it never nags.
 */
export function InstallBanner() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) return;
    // iPhones never fire beforeinstallprompt: decide off the render path, like a late event.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled && isIosSafari()) setMode("ios");
    });

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the prompt for our own button
      setEvent(e as InstallEvent);
      setMode("chromium");
    };
    const onInstalled = () => setMode("hidden");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private mode: the banner simply comes back next visit.
    }
    setMode("hidden");
  };

  if (mode === "hidden") return null;

  return (
    <aside
      aria-label="Install the app"
      className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 shadow-edge"
    >
      <p className="min-w-0 flex-1 text-sm text-ink-soft">
        {mode === "chromium" ? (
          <>
            <span className="font-semibold text-ink">Get the OAC app.</span> Faster to open, works offline, and tells you
            when your order is ready.
          </>
        ) : (
          <>
            <span className="font-semibold text-ink">Add OAC to your Home Screen.</span> Tap Share, then{" "}
            <span className="whitespace-nowrap">“Add to Home Screen”</span>, to get order-ready alerts.
          </>
        )}
      </p>
      <div className="flex shrink-0 gap-2">
        {mode === "chromium" && event && (
          <Button
            onClick={async () => {
              await event.prompt();
              setEvent(null); // the browser allows one prompt per event
              setMode("hidden");
            }}
          >
            Install
          </Button>
        )}
        <Button variant="ghost" onClick={dismiss}>
          {mode === "chromium" ? "Not now" : "Got it"}
        </Button>
      </div>
    </aside>
  );
}
