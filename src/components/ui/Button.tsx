import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
/** Both sizes meet the 48px staff touch-target minimum. */
export type ButtonSize = "md" | "lg";

type StyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

const base =
  "inline-flex select-none items-center justify-center gap-2 rounded-control font-sans font-semibold leading-none " +
  "transition-[transform,box-shadow,background-color,color] duration-150 ease-snap " +
  "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint disabled:shadow-none disabled:border-line " +
  "aria-disabled:cursor-not-allowed";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand shadow-press hover:bg-brand-deep active:translate-y-0.5 active:shadow-none",
  secondary:
    "border-2 border-brand bg-surface text-brand hover:bg-brand-soft active:translate-y-px",
  ghost: "text-ink hover:bg-sunken active:translate-y-px",
  danger:
    "border-2 border-danger bg-surface text-danger-deep hover:bg-danger-soft active:translate-y-px",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-12 min-w-12 px-5 text-base",
  lg: "min-h-14 min-w-14 px-6 text-lg",
};

/** Class string for anything that should look like a Button, e.g. a next/link anchor. */
export function buttonStyles({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: StyleOptions = {}): string {
  return cn(base, variants[variant], sizes[size], fullWidth && "w-full", className);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<StyleOptions, "className"> & {
    /** Shows a spinner, disables the button and sets aria-busy. */
    loading?: boolean;
  };

export function Button({
  variant,
  size,
  fullWidth,
  loading = false,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5 shrink-0 motion-safe:animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </svg>
  );
}
