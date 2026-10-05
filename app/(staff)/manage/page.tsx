import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { StagePlaceholder } from "@/components/ui/stage-placeholder";
import { requireRole } from "@/lib/auth/current";

export const metadata: Metadata = { title: "Панель старосты" };

export default async function ManagePage() {
  const { user } = await requireRole("starosta", "admin");

  return (
    <>
      <PageHeader eyebrow={user.role === "admin" ? "Админ" : "Староста"} title="Панель" />
      <div className="flex max-w-xl flex-col gap-4">
        {user.role === "admin" ? (
          <Link
            href="/manage/users"
            className="flex items-center gap-4 rounded-card border border-line bg-surface p-[14px] text-ink no-underline hover:bg-surface-muted md:p-[22px]"
          >
            <Users size={22} strokeWidth={1.8} className="text-accent" aria-hidden />
            <span>
              <span className="block font-bold">Пользователи</span>
              <span className="text-[14px] text-muted">Доступ, роли, группы, ссылки для входа</span>
            </span>
          </Link>
        ) : null}
        <StagePlaceholder stage="M2">
          Изменения расписания, базовое расписание, «Неразобранное», новости, темы и рубежки.
        </StagePlaceholder>
      </div>
    </>
  );
}
