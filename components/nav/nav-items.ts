import type { Route } from "next";
import {
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  Gauge,
  ListChecks,
  Megaphone,
  Menu,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone tab bar (5 items max). */
  mobile: boolean;
  /** Shown in the top bar on wider screens. */
  desktop: boolean;
  /** Other sections that light this item up (for «Ещё»). */
  also?: string[];
}

/** Sections reached through «Ещё» on phones. */
export const MORE_ITEMS: { href: Route; label: string; icon: LucideIcon; text: string }[] = [
  { href: "/week", label: "Расписание на неделю", icon: CalendarDays, text: "Все пары недели" },
  { href: "/grades", label: "Успеваемость", icon: Gauge, text: "Свои баллы и автомат" },
  { href: "/teachers", label: "Преподаватели", icon: Users, text: "Фото, почта для связи" },
  { href: "/news", label: "Новости", icon: Megaphone, text: "Объявления старост" },
];

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", icon: Sun, mobile: true, desktop: true },
  { href: "/week", label: "Расписание", icon: CalendarDays, mobile: false, desktop: true },
  { href: "/topics", label: "Темы", icon: ListChecks, mobile: true, desktop: true },
  { href: "/tasks", label: "Задания", icon: ClipboardCheck, mobile: true, desktop: true },
  { href: "/library", label: "Конспекты", icon: BookOpenText, mobile: true, desktop: true },
  { href: "/grades", label: "Успеваемость", icon: Gauge, mobile: false, desktop: true },
  {
    href: "/more",
    label: "Ещё",
    icon: Menu,
    mobile: true,
    desktop: true,
    also: ["/week", "/grades", "/teachers", "/news"],
  },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Active for this nav: on desktop «Ещё» lights up only for sections not in the top bar. */
export function isItemActive(pathname: string, item: NavItem, variant: "mobile" | "desktop") {
  if (isActive(pathname, item.href)) return true;
  const visible = NAV_ITEMS.filter((i) => i[variant]).map((i) => i.href as string);
  return (item.also ?? []).some((h) => !visible.includes(h) && isActive(pathname, h));
}
