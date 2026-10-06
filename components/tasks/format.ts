import { displayName } from "@/components/library/format";
import type { IsoDate } from "@/lib/schedule/dates";
import { shortDate } from "@/lib/schedule/format";
import type { TimeRange } from "@/lib/schedule/types";
import type { ControlEventView, MaterialOption, MaterialView } from "@/lib/services/tasks";
import type { DuePlace } from "@/lib/tasks/place";
import { untilLabel } from "@/lib/tasks/place";

type Slots = Map<number, TimeRange>;

/** «к 2 паре · 10:10», «к 18:00», «к этому дню» (the date is shown by the group heading). */
export function dueTime(due: DuePlace, slots: Slots): string {
  if (due.slotN !== null) {
    const slot = slots.get(due.slotN);
    return `к ${due.slotN} паре${slot ? ` · ${slot.start}` : ""}`;
  }
  if (due.startsAt) return `к ${due.startsAt}`;
  return "к этому дню";
}

/** «ср, 08.10 · к 2 паре · 10:10» */
export function dueFull(due: DuePlace, slots: Slots): string {
  const time = due.slotN !== null || due.startsAt ? ` · ${dueTime(due, slots)}` : "";
  return `${shortDate(due.date)}${time}`;
}

/** «2 пара · 10:10–11:40» or «12:00–13:30» */
export function controlTime(event: ControlEventView, slots: Slots): string {
  if (event.slotN !== null) {
    const slot = slots.get(event.slotN);
    return `${event.slotN} пара${slot ? ` · ${slot.start}–${slot.end}` : ""}`;
  }
  return [event.startsAt, event.endsAt].filter(Boolean).join("–");
}

/** Group heading: «Сегодня», «Завтра», «пт, 09.10 · через 3 дня». */
export function dayHeading(today: IsoDate, date: IsoDate): string {
  const until = untilLabel(today, date);
  if (until === "сегодня") return `Сегодня · ${shortDate(date)}`;
  if (until === "завтра") return `Завтра · ${shortDate(date)}`;
  return `${shortDate(date)} · ${until}`;
}

export interface MaterialLink {
  label: string;
  detail: string | null;
  href: string;
  external: boolean;
  kind: "file" | "photo" | "note" | "link";
}

export function materialLink(m: MaterialView): MaterialLink {
  switch (m.kind) {
    case "media":
      return {
        label: displayName(m),
        detail: m.page ? `стр. ${m.page}` : null,
        href: `/view/${m.mediaId}${m.page && m.page > 1 ? `?page=${m.page}` : ""}`,
        external: false,
        kind: m.mediaKind,
      };
    case "note":
      return {
        label: m.noteTitle ?? "Конспект занятия",
        detail: shortDate(m.date),
        href: `/library/${m.subjectId}#note-${m.noteId}`,
        external: false,
        kind: "note",
      };
    case "link": {
      let host = m.url;
      try {
        host = new URL(m.url).hostname.replace(/^www\./, "");
      } catch {
        // stored URLs are validated; keep the raw text just in case
      }
      return {
        label: m.title ?? host,
        detail: m.title ? host : null,
        href: m.url,
        external: true,
        kind: "link",
      };
    }
  }
}

export function optionLabel(o: MaterialOption): string {
  return o.kind === "file"
    ? displayName({ title: o.title, fileName: o.fileName ?? "" })
    : `Конспект ${shortDate(o.date!)}${o.title ? ` · ${o.title}` : ""}`;
}

/** Body text → items: one per line, list markers («-», «•», «1.») stripped. */
export function bodyLines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim().replace(/^([-–—•*]|\d+[.)])\s+/, ""))
    .filter(Boolean);
}
