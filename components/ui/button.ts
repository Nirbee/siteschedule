const base =
  "inline-flex items-center justify-center gap-2 rounded-[14px] px-5 font-bold no-underline transition-colors disabled:opacity-50 disabled:pointer-events-none";

const variants = {
  primary: "h-[54px] bg-accent-solid text-[16px] text-on-accent hover:bg-accent-solid-hover",
  secondary: "h-12 border border-line-strong bg-surface text-[15px] text-ink hover:bg-chip",
  ghost: "h-11 text-[15px] text-ink-2 hover:bg-chip",
  danger: "h-11 border border-line-strong bg-surface text-[15px] text-cancel hover:bg-cancel-bg",
} as const;

/** Class names for button-looking elements (<button>, <a>, <Link>). */
export function buttonClass(variant: keyof typeof variants = "primary", extra = ""): string {
  return `${base} ${variants[variant]} ${extra}`.trim();
}
