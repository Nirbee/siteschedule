import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, CircleUserRound, ShieldCheck } from "lucide-react";
import { MORE_ITEMS } from "@/components/nav/nav-items";
import { PageHeader } from "@/components/ui/page-header";
import { isStaff, requireMember } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Ещё" };

export default async function MorePage() {
  const { user } = await requireMember();
  const items = [
    ...MORE_ITEMS,
    {
      href: "/profile" as const,
      label: "Профиль",
      icon: CircleUserRound,
      text: "Тема, ФИО для списков, устройства",
    },
    ...(isStaff(user.role)
      ? [
          {
            href: "/manage" as const,
            label: "Панель старосты",
            icon: ShieldCheck,
            text: "Расписание, задания, темы, разбор фото",
          },
        ]
      : []),
  ];
  return (
    <>
      <PageHeader title="Ещё" />
      <ul className="flex max-w-xl flex-col gap-2">
        {items.map(({ href, label, icon: Icon, text }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex min-h-[64px] items-center gap-4 rounded-card border border-line bg-surface px-[14px] py-3 text-ink no-underline hover:bg-surface-muted"
            >
              <Icon size={22} strokeWidth={1.8} className="shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{label}</span>
                <span className="text-[14px] text-muted">{text}</span>
              </span>
              <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
