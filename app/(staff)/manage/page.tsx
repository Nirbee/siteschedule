import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import {
  CalendarCog,
  ClipboardCheck,
  History,
  Images,
  ListChecks,
  NotebookPen,
  Pencil,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClass } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/current";
import { inboxCounts } from "@/lib/services/inbox";

export const metadata: Metadata = { title: "Панель старосты" };

export default async function ManagePage() {
  const { user } = await requireRole("starosta", "admin");
  const inbox = await inboxCounts();

  return (
    <>
      <PageHeader eyebrow={user.role === "admin" ? "Админ" : "Староста"} title="Панель" />
      <div className="flex max-w-xl flex-col gap-3">
        <Link href="/manage/changes/new" className={buttonClass("primary", "w-full")}>
          <Pencil size={20} aria-hidden /> Изменить расписание
        </Link>
        <Tile
          href="/manage/inbox"
          icon={Images}
          title={inbox.unsorted ? `Разбор фото из чата · ${inbox.unsorted}` : "Разбор фото из чата"}
          text={
            inbox.unsorted
              ? "Неразобранное: отнести к паре, в материалы или удалить"
              : "Всё разобрано; можно проверить, что разложилось само"
          }
        />
        <Tile
          href="/manage/tasks/new?type=assignment"
          icon={NotebookPen}
          title="Задание"
          text="Что сделать к паре: прочитать, решить, рассказать у доски"
        />
        <Tile
          href="/manage/tasks/new?type=control"
          icon={ClipboardCheck}
          title="Контрольная"
          text="Дата, что будет, что можно, материалы для подготовки"
        />
        <Tile
          href="/manage/topics/new"
          icon={ListChecks}
          title="Список тем"
          text="С фото листа или из Excel; код для тех, кто на паре; выгрузка для преподавателя"
        />
        <Tile
          href="/manage/changes"
          icon={History}
          title="История изменений"
          text="Кто, что и когда менял; отзыв ошибочных"
        />
        <Tile
          href="/manage/schedule"
          icon={CalendarCog}
          title="Базовое расписание"
          text="Семестр, дисциплины, пары по дням"
        />
        {user.role === "admin" ? (
          <Tile
            href="/manage/users"
            icon={Users}
            title="Пользователи"
            text="Доступ, роли, группы, ссылки для входа"
          />
        ) : null}
      </div>
    </>
  );
}

function Tile({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: Route;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 rounded-card border border-line bg-surface p-[14px] text-ink no-underline hover:bg-surface-muted md:p-[22px]"
    >
      <Icon size={22} strokeWidth={1.8} className="shrink-0 text-accent" aria-hidden />
      <span>
        <span className="block font-bold">{title}</span>
        <span className="text-[14px] text-muted">{text}</span>
      </span>
    </Link>
  );
}
