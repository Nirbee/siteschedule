import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";
import { FileRow } from "@/components/library/file-row";
import { ItemActions, NoteTitleForm } from "@/components/library/item-actions";
import { PhotoGrid } from "@/components/library/photo-viewer";
import { UploadSheet } from "@/components/library/upload-sheet";
import { requireMember, isStaff } from "@/lib/auth/current";
import { KIND_LABELS, shortDate } from "@/lib/schedule/format";
import {
  getSubject,
  getUploadOptions,
  listSubjectsWithCounts,
  subjectLibrary,
  type LessonFilter,
  type LibraryItem,
  type LibraryNote,
} from "@/lib/services/library";

type Params = { subjectId: string };
type Search = { tab?: string; f?: string; q?: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { subjectId } = await params;
  const subject = /^[0-9a-f-]{36}$/.test(subjectId) ? await getSubject(subjectId) : undefined;
  return { title: subject?.shortName ?? subject?.name ?? "Конспекты" };
}

const FILTERS: { value: LessonFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "lecture", label: "Лекции" },
  { value: "seminar", label: "Семинары" },
];

export default async function SubjectLibraryPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ user }, { subjectId }, search] = await Promise.all([
    requireMember(),
    params,
    searchParams,
  ]);
  const subject = /^[0-9a-f-]{36}$/.test(subjectId) ? await getSubject(subjectId) : undefined;
  if (!subject) notFound();

  const tab = search.tab === "materials" ? "materials" : "lessons";
  const filter = FILTERS.some((f) => f.value === search.f) ? (search.f as LessonFilter) : "all";
  const q = (search.q ?? "").slice(0, 100);
  const [{ notes, materials }, subjects, upload] = await Promise.all([
    subjectLibrary(subject.id, { filter, q }),
    listSubjectsWithCounts(),
    getUploadOptions(user.groupId!),
  ]);
  const canEdit = (item: LibraryItem) => isStaff(user.role) || item.uploaderId === user.id;
  const href = (patch: Partial<Search>) => {
    const next = new URLSearchParams({ tab, f: filter, q, ...patch });
    for (const [key, value] of [...next])
      if (!value || value === "all" || value === "lessons") next.delete(key);
    const query = next.toString();
    return `/library/${subject.id}${query ? `?${query}` : ""}` as Route;
  };
  const photoCount = notes.reduce(
    (n, note) => n + note.items.filter((i) => i.kind === "photo").length,
    0,
  );

  return (
    <div className="flex gap-8">
      <nav aria-label="Дисциплины" className="hidden w-64 shrink-0 lg:block">
        <ul className="sticky top-6 flex flex-col gap-1">
          {subjects.map((s) => (
            <li key={s.id}>
              <Link
                href={`/library/${s.id}` as Route}
                aria-current={s.id === subject.id ? "page" : undefined}
                className={`flex items-center justify-between gap-2 rounded-field px-3 py-2.5 text-[14px] no-underline ${
                  s.id === subject.id
                    ? "bg-emph font-bold text-on-emph"
                    : "text-ink-2 hover:bg-chip"
                }`}
              >
                <span className="min-w-0 truncate">{s.shortName ?? s.name}</span>
                <span className="shrink-0 font-mono text-[12px] opacity-70">
                  {s.photos + s.files}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-5">
        <div>
          <Link
            href="/library"
            className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold lg:hidden"
          >
            <ArrowLeft size={16} aria-hidden /> Все дисциплины
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="mb-1 eyebrow">Конспекты</p>
              <h1 className="font-display text-[24px] leading-tight font-bold tracking-[-0.03em] md:text-[32px]">
                {subject.name}
              </h1>
            </div>
            <UploadSheet {...upload} subjectId={subject.id} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-[14px] bg-chip p-1">
            {(
              [
                ["lessons", `Занятия${photoCount ? ` · ${photoCount} фото` : ""}`],
                ["materials", `Материалы${materials.length ? ` · ${materials.length}` : ""}`],
              ] as const
            ).map(([value, label]) => (
              <Link
                key={value}
                role="tab"
                aria-selected={tab === value}
                href={href({ tab: value })}
                className={`flex h-10 items-center justify-center rounded-[10px] px-3 text-[14px] no-underline ${
                  tab === value ? "bg-surface font-bold text-ink" : "font-semibold text-ink-2"
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
          <form
            action={`/library/${subject.id}`}
            className="flex min-w-[220px] flex-1 items-center gap-2 rounded-field border border-line-strong bg-surface px-3"
          >
            {tab === "materials" ? <input type="hidden" name="tab" value="materials" /> : null}
            <Search size={18} className="shrink-0 text-muted" aria-hidden />
            <input
              name="q"
              defaultValue={q}
              placeholder="Поиск по теме или названию"
              aria-label="Поиск"
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none"
            />
          </form>
        </div>
        {q.trim().length >= 2 ? (
          <Link
            href={`/library?q=${encodeURIComponent(q.trim())}` as Route}
            className="-mt-2 self-start text-[14px] font-semibold"
          >
            Искать «{q.trim()}» в тексте всех файлов →
          </Link>
        ) : null}

        {tab === "lessons" ? (
          <>
            <div className="flex gap-2">
              {FILTERS.map((f) => (
                <Link
                  key={f.value}
                  href={href({ f: f.value })}
                  aria-current={filter === f.value ? "true" : undefined}
                  className={`flex h-9 items-center rounded-full border px-4 text-[14px] no-underline ${
                    filter === f.value
                      ? "border-emph bg-emph font-bold text-on-emph"
                      : "border-line-strong text-ink-2 hover:bg-chip"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            {notes.length === 0 ? (
              <Empty
                text={q ? "Ничего не нашлось." : "Пока никто ничего не загрузил к занятиям."}
              />
            ) : (
              notes.map((note) => (
                <NoteSection
                  key={note.id}
                  note={note}
                  canEdit={canEdit}
                  canEditTitle={
                    isStaff(user.role) || note.items.some((i) => i.uploaderId === user.id)
                  }
                />
              ))
            )}
          </>
        ) : materials.length === 0 ? (
          <Empty
            text={q ? "Ничего не нашлось." : "Учебники, методички и задания появятся здесь."}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {materials.map((item) => (
              <FileRow key={item.id} item={item} canEdit={canEdit(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteSection({
  note,
  canEdit,
  canEditTitle,
}: {
  note: LibraryNote;
  canEdit: (item: LibraryItem) => boolean;
  canEditTitle: boolean;
}) {
  const photos = note.items.filter((i) => i.kind === "photo");
  const files = note.items.filter((i) => i.kind === "file");
  const uploaders = [...new Set(note.items.map((i) => i.uploaderName).filter(Boolean))];
  const when = [
    shortDate(note.date),
    note.slotN ? `${note.slotN} пара` : note.startsAt,
    note.kind ? KIND_LABELS[note.kind] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section
      id={`note-${note.id}`}
      className="scroll-mt-20 rounded-card border border-line bg-surface p-[14px] md:p-[20px]"
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[13px] text-muted">{when}</p>
          <h2 className="text-[17px] leading-snug font-bold">{note.title ?? "Без темы"}</h2>
          {uploaders.length ? (
            <p className="text-[13px] text-muted">Загрузили: {uploaders.join(", ")}</p>
          ) : null}
        </div>
      </header>
      {photos.length ? (
        <PhotoGrid
          photos={photos.map((p) => ({
            id: p.id,
            width: p.width,
            height: p.height,
            caption: note.title ?? undefined,
          }))}
        />
      ) : null}
      {files.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {files.map((item) => (
            <FileRow key={item.id} item={item} canEdit={canEdit(item)} />
          ))}
        </div>
      ) : null}
      {photos.some(canEdit) || canEditTitle ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3">
          {canEditTitle ? <NoteTitleForm id={note.id} title={note.title} /> : null}
          {photos.some(canEdit) ? (
            <details>
              <summary className="cursor-pointer text-[13px] font-semibold text-accent">
                Удалить фото
              </summary>
              <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
                {photos.filter(canEdit).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-1 rounded-[10px] bg-surface-muted p-1"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private, session-checked URLs */}
                    <img
                      src={`/media/${p.id}/preview`}
                      alt=""
                      className="aspect-[4/3] w-16 rounded-[6px] object-cover"
                    />
                    <ItemActions id={p.id} title={null} kind="photo" />
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-card border border-dashed border-line p-[22px] text-center text-muted">
      {text}
    </p>
  );
}
