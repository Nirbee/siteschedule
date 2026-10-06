import type { Metadata, Route } from "next";
import Link from "next/link";
import { ChevronRight, Plus } from "lucide-react";
import { phaseText } from "@/components/topics/phase";
import { buttonClass } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { isStaff, requireMember } from "@/lib/auth/current";
import { shortDate } from "@/lib/schedule/format";
import { listTopicLists } from "@/lib/services/topics";

export const metadata: Metadata = { title: "Темы" };

export default async function TopicsPage() {
  const { user } = await requireMember();
  const lists = await listTopicLists(user);
  const staff = isStaff(user.role);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageHeader eyebrow="Доклады и рефераты" title="Темы" />
        {staff ? (
          <Link href="/manage/topics/new" className={buttonClass("secondary", "mb-6 px-4")}>
            <Plus size={18} aria-hidden /> Список тем
          </Link>
        ) : null}
      </div>

      {lists.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
          Списков тем пока нет. Когда преподаватель раздаст темы, староста выложит их здесь.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lists.map((list) => (
            <li key={list.id}>
              <Link
                href={`/topics/${list.id}` as Route}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-[14px] text-ink no-underline hover:bg-surface-muted md:p-[18px]"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] text-muted">{list.subjectName}</span>
                  <span className="block text-[17px] leading-snug font-bold">{list.title}</span>
                  <span className="mt-1 block text-[14px] text-ink-2">
                    {phaseText(list)} · занято {list.full} из {list.total}
                  </span>
                  {list.mine ? (
                    <span className="mt-2 block rounded-[10px] bg-add-bg px-2.5 py-1.5 text-[14px] text-add">
                      Твоя тема: {list.mine.n}. {list.mine.title}
                      {list.mine.dueDate ? ` · сдача ${shortDate(list.mine.dueDate)}` : ""}
                    </span>
                  ) : null}
                </span>
                <ChevronRight size={20} className="shrink-0 text-muted" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
