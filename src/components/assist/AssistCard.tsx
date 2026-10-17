"use client";

import Image from "next/image";
import { useState } from "react";
import { MoodSheet } from "@/components/assist/MoodSheet";
import { momentLabel, type MealMoment } from "@/lib/assist/moment";

/** Home-screen entry to the mood assistant. Sits where the static promo used to be. */
export function AssistCard({ canteenId, moment }: { canteenId: string; moment: MealMoment }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <section
        aria-label="Canteen assistant"
        className="relative overflow-hidden rounded-card bg-brand-deep p-5 text-on-brand shadow-lift"
      >
        <Image
          src="/figma/photos/p1.jpg"
          alt=""
          fill
          priority
          sizes="(max-width: 576px) 60vw, 340px"
          className="object-cover object-center opacity-70 [mask-image:linear-gradient(to_right,transparent_35%,black_90%)] [-webkit-mask-image:linear-gradient(to_right,transparent_35%,black_90%)]"
        />
        <div className="relative max-w-[13.5rem]">
          <p className="font-display text-[1.375rem] font-bold leading-tight">
            {momentLabel(moment)}. What are you in the mood for?
          </p>
          <p className="mt-1.5 text-sm text-on-brand/80">Tell us how you feel and we will pick from today&apos;s menu.</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-control bg-paper px-5 text-sm font-semibold text-ink shadow-press transition-transform duration-150 active:translate-y-0.5"
          >
            Ask the assistant
          </button>
        </div>
      </section>
      <MoodSheet open={open} onClose={() => setOpen(false)} canteenId={canteenId} />
    </>
  );
}
