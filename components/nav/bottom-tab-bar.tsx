"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isItemActive } from "./nav-items";

export function BottomTabBar() {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.mobile);

  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const { href, label, icon: Icon } = item;
          const active = isItemActive(pathname, item, "mobile");
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold no-underline ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon size={22} strokeWidth={1.8} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
