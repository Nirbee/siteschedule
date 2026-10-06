import type { Route } from "next";
import {
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  ListChecks,
  Megaphone,
  Sun,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: Route;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone tab bar (5 items max). */
  mobile: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Сегодня", icon: Sun, mobile: true },
  { href: "/week", label: "Расписание", icon: CalendarDays, mobile: false },
  { href: "/topics", label: "Темы", icon: ListChecks, mobile: true },
  { href: "/tasks", label: "Задания", icon: ClipboardCheck, mobile: true },
  { href: "/library", label: "Конспекты", icon: BookOpenText, mobile: true },
  { href: "/news", label: "Новости", icon: Megaphone, mobile: true },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
