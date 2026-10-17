import { cn } from "@/lib/cn";

/** The Iconly 3.0 icons from the JavaGem Figma file (public/figma/icons), cut by scripts/cut-figma-assets.mjs. */
export type IconName =
  | "search"
  | "home"
  | "bell"
  | "up"
  | "heart"
  | "bag"
  | "more"
  | "filter"
  | "call"
  | "discount"
  | "down"
  | "left"
  | "right"
  | "star";

/**
 * Each icon is a black-on-transparent mask, so it takes the current text colour: set `text-*` on it
 * or on a parent. Decorative; the control that holds it carries the accessible name.
 */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  const url = `url(/figma/icons/${name}.png)`;
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-6 shrink-0 bg-current", className)}
      style={{
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
