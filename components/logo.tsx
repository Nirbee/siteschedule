import Link from "next/link";

export function Logo() {
  return (
    <Link
      href="/"
      className="font-display text-[22px] font-bold tracking-[-0.03em] text-ink no-underline"
      aria-label="пара. — на главную"
    >
      пара<span className="text-accent">.</span>
    </Link>
  );
}
