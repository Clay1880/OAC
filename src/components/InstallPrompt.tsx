"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

type InstallEvent = Event & { prompt: () => Promise<void> };

/** Chromium's install button. iPhones have no such API; PushOptIn explains Add to Home Screen there. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our own button
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!event) return null;
  return (
    <Button
      variant="ghost"
      fullWidth
      onClick={async () => {
        await event.prompt();
        setEvent(null); // the browser only allows one prompt per event
      }}
    >
      Install the OAC app
    </Button>
  );
}
