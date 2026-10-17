"use client";

import { Field } from "@/components/ui/Field";

/** Type the last characters of an order ID to jump to that order. */
export function CodeLookup({
  value,
  onChange,
  matchCount,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Number of orders matching the current text; only shown once something is typed. */
  matchCount: number;
}) {
  const typed = value.trim() !== "";
  return (
    <Field
      label="Find by order ID"
      name="code"
      type="search"
      autoComplete="off"
      autoCapitalize="characters"
      spellCheck={false}
      placeholder="Last characters, e.g. M2P"
      className="font-mono uppercase tracking-wider"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      hint={
        typed
          ? matchCount === 0
            ? "No order matches. Order IDs never contain 0, 1, I or O."
            : `${matchCount} ${matchCount === 1 ? "order" : "orders"} found`
          : undefined
      }
    />
  );
}
