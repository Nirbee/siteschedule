import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye, QrCode, X } from "lucide-react";
import { phaseText, STATUS_LABELS, STATUS_STYLES } from "@/components/topics/phase";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth/current";
import { shortDate } from "@/lib/schedule/format";
import { listSubjects } from "@/lib/services/schedule-admin";
import { assignableUsers, exportRows, getTopicList } from "@/lib/services/topics";
import { toDateTimeInput } from "@/lib/time";
import { listAsText } from "@/lib/topics/rules";
import {
  deleteTopicAction,
  deleteTopicListAction,
  openForClassAction,
  removeMemberAction,
  topicDoneAction,
} from "../actions";
import { ListFields } from "../list-fields";
import {
  AddTopicsForm,
  AssignForm,
  CopyText,
  ListSettingsForm,
  OpensAtForm,
  TopicEditForm,
} from "./manage-forms";

export const metadata: Metadata = { title: "Управление темами" };

export default async function ManageTopicListPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const [{ user }, { listId }] = await Promise.all([requireRole("starosta", "admin"), params]);
  const list = /^[0-9a-f-]{36}$/.test(listId) ? await getTopicList(listId, user) : undefined;
  if (!list) notFound();
  const [people, rows, subjects] = await Promise.all([
    assignableUsers(),
    exportRows(list.id, user.id),
    listSubjects(),
  ]);
  const scheduled = list.phase !== "open" ? toDateTimeInput(list.opensAt) : "";

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <Link
          href={`/topics/${list.id}` as Route}
          className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold"
        >
          <ArrowLeft size={16} aria-hidden /> К списку
        </Link>
        <PageHeader eyebrow={list.subjectName} title={list.title} />
        <p className="-mt-4 text-ink-2">
          {phaseText(list)} · занято {list.full} из {list.total}
        </p>
      </div>

      <Card title="Открытие">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-[14px] text-ink-2">
              На паре: на вашем экране появится код и QR — кто на паре, вводит его и сразу выбирает
              тему. Остальные пока только видят список.
            </p>
            {list.phase === "class" ? (
              <Link href={`/code/${list.id}` as Route} className={buttonClass("primary", "w-full")}>
                <QrCode size={20} aria-hidden /> Показать код
              </Link>
            ) : list.phase === "draft" || list.phase === "scheduled" ? (
              <form action={openForClassAction}>
                <input type="hidden" name="listId" value={list.id} />
                <button type="submit" className={buttonClass("primary", "w-full")}>
                  <QrCode size={20} aria-hidden /> Открыть для присутствующих
                </button>
              </form>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-[14px] text-ink-2">
              Для всех: сразу или в заданное время. В этот момент бот напишет в чат, какие темы
              свободны (заработает, когда бота добавят в чат).
            </p>
            <OpensAtForm listId={list.id} scheduled={scheduled} isOpen={list.phase === "open"} />
          </div>
          <Link
            href={`/topics/${list.id}` as Route}
            className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
          >
            <Eye size={16} aria-hidden /> Как видят студенты
          </Link>
        </div>
      </Card>

      <Card title="Для преподавателя и чата">
        <a
          href={`/manage/topics/${list.id}/export`}
          className={buttonClass("secondary", "mb-3 self-start")}
        >
          <Download size={18} aria-hidden /> Скачать для Excel
        </a>
        <CopyText text={listAsText(list.title, list.subjectName, rows)} />
      </Card>

      <Card title="Записать вручную">
        <AssignForm listId={list.id} topics={list.topics} people={people} />
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="eyebrow">Темы</h2>
        {list.topics.map((topic) => (
          <article
            key={topic.id}
            className={`rounded-card border border-line bg-surface p-[14px] ${
              topic.isDone ? "opacity-75" : ""
            }`}
          >
            <div className="flex gap-3">
              <span className="w-7 shrink-0 text-right font-mono text-muted">{topic.n}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                  <h3 className="leading-snug font-bold">{topic.title}</h3>
                  <span
                    className={`rounded-badge px-2 py-0.5 text-[12px] font-bold ${
                      STATUS_STYLES[topic.status === "mine" ? "full" : topic.status]
                    }`}
                  >
                    {STATUS_LABELS[topic.status === "mine" ? "full" : topic.status]}
                  </span>
                </div>
                {topic.details ? <p className="text-[15px] text-ink-2">{topic.details}</p> : null}
                <p className="mt-1 font-mono text-[13px] text-muted">
                  {topic.members.length}/{topic.capacity}
                  {topic.dueDate
                    ? ` · сдача ${shortDate(topic.dueDate)}${topic.dueOrder ? ` · ${topic.dueOrder}-й` : ""}`
                    : " · дата не назначена"}
                </p>
                {topic.members.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {topic.members.map((m) => (
                      <li
                        key={m.userId}
                        className="flex items-center gap-1 rounded-full bg-chip py-0.5 pr-0.5 pl-3 text-[14px]"
                      >
                        {m.name}
                        {m.group ? <span className="text-muted">· {m.group}</span> : null}
                        <form action={removeMemberAction}>
                          <input type="hidden" name="listId" value={list.id} />
                          <input type="hidden" name="topicId" value={topic.id} />
                          <input type="hidden" name="userId" value={m.userId} />
                          <button
                            type="submit"
                            aria-label={`Убрать ${m.name}`}
                            className="flex size-8 items-center justify-center rounded-full text-muted hover:bg-line"
                          >
                            <X size={15} aria-hidden />
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <form action={topicDoneAction}>
                    <input type="hidden" name="listId" value={list.id} />
                    <input type="hidden" name="topicId" value={topic.id} />
                    <input type="hidden" name="done" value={String(!topic.isDone)} />
                    <button type="submit" className={buttonClass("ghost", "h-10 px-3 text-[14px]")}>
                      {topic.isDone ? "Вернуть: не сдано" : "Отметить «сдано»"}
                    </button>
                  </form>
                </div>
                <details className="mt-1">
                  <summary className="cursor-pointer py-2 text-[14px] font-semibold text-accent">
                    Изменить тему, дату сдачи
                  </summary>
                  <TopicEditForm listId={list.id} topic={topic} />
                  <form action={deleteTopicAction} className="mt-2">
                    <input type="hidden" name="listId" value={list.id} />
                    <input type="hidden" name="topicId" value={topic.id} />
                    <ConfirmSubmit
                      message={`Удалить тему «${topic.title}»? Записавшиеся на неё будут убраны.`}
                    >
                      Удалить тему
                    </ConfirmSubmit>
                  </form>
                </details>
              </div>
            </div>
          </article>
        ))}
      </section>

      <Card title="Добавить темы">
        <AddTopicsForm listId={list.id} />
      </Card>

      <Card title="Настройки списка">
        <ListSettingsForm listId={list.id}>
          <ListFields
            subjects={subjects.filter((s) => s.name !== "Самостоятельная работа")}
            initial={{
              subjectId: list.subjectId,
              title: list.title,
              defaultCapacity: list.defaultCapacity,
              pickDeadline: list.pickDeadline,
              rules: list.rules,
            }}
          />
        </ListSettingsForm>
        <form action={deleteTopicListAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="listId" value={list.id} />
          <ConfirmSubmit message="Удалить весь список тем вместе с записями? Отменить нельзя.">
            Удалить весь список
          </ConfirmSubmit>
        </form>
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col rounded-card border border-line bg-surface p-[14px] md:p-[22px]">
      <h2 className="mb-3 eyebrow">{title}</h2>
      {children}
    </section>
  );
}
