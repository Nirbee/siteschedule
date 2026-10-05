"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleUserRound } from "lucide-react";
import { Logo } from "@/components/logo";
import { NAV_ITEMS, isActive } from "./nav-items";

export function TopNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-6 px-[18px] md:px-6">
        <Logo />
        <nav aria-label="Разделы" className="hidden flex-1 items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center rounded-field px-3.5 text-[15px] font-semibold no-underline transition-colors ${
                  active ? "bg-emph text-on-emph" : "text-ink-2 hover:bg-chip"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/profile"
          aria-label="Профиль"
          className="ml-auto flex size-11 items-center justify-center rounded-field text-ink-2 hover:bg-chip"
        >
          <CircleUserRound size={22} strokeWidth={1.8} />
        </Link>
      </div>
    </header>
  );
}
