// Topic lists: phases, statuses, parsing pasted lists, the rotating class code. Pure functions.
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * draft — only staff sees it; scheduled — visible, opens for everyone later;
 * class — only those who entered the code at the lesson may pick; open — everyone; closed —
 * after the deadline only staff changes anything.
 */
export type ListPhase = "draft" | "scheduled" | "class" | "open" | "closed";

export interface PhaseInput {
  classOpenedAt: Date | null;
  opensAt: Date | null;
  pickDeadline: Date | null;
}

export function listPhase(list: PhaseInput, now: Date = new Date()): ListPhase {
  if (list.pickDeadline && now >= list.pickDeadline) return "closed";
  if (list.opensAt && list.opensAt <= now) return "open";
  if (list.classOpenedAt) return "class";
  if (list.opensAt) return "scheduled";
  return "draft";
}

/** Whether a student may take or leave a topic now. */
export function canPick(phase: ListPhase, hasClassAccess: boolean): boolean {
  return phase === "open" || (phase === "class" && hasClassAccess);
}

export type TopicStatus = "done" | "mine" | "full" | "partial" | "free";

export function topicStatus(
  topic: { isDone: boolean; capacity: number },
  members: number,
  mine: boolean,
): TopicStatus {
  if (topic.isDone) return "done";
  if (mine) return "mine";
  if (members >= topic.capacity) return "full";
  return members > 0 ? "partial" : "free";
}

/** The code on the starosta's screen changes every 30 s. */
export const CODE_STEP_MS = 30_000;

export function classCode(secret: string, now: number = Date.now()): string {
  const window = Math.floor(now / CODE_STEP_MS);
  const digest = createHmac("sha256", secret).update(String(window)).digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, "0");
}

/** Accepts the current and the previous code (someone was still typing when it changed). */
export function verifyClassCode(secret: string, code: string, now: number = Date.now()): boolean {
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 4) return false;
  return [now, now - CODE_STEP_MS].some((t) =>
    timingSafeEqual(Buffer.from(classCode(secret, t)), Buffer.from(clean)),
  );
}

/** «ИУ8-12М» → «12М». */
export function shortGroup(code: string | null): string | null {
  if (!code) return null;
  return /(\d+\D*)$/.exec(code)?.[1] ?? code;
}

export interface ListSummaryTopic {
  n: number;
  title: string;
  details: string | null;
  capacity: number;
  members: number;
}

/** Telegram text when a list opens for everyone (sent by the bot, M6). */
export function openingAnnouncement(
  list: { title: string; subjectName: string; url: string; deadline: string | null },
  topics: ListSummaryTopic[],
): string {
  const name = (t: ListSummaryTopic) => `${t.n}. ${t.title}${t.details ? ` — ${t.details}` : ""}`;
  const free = topics.filter((t) => t.members < t.capacity);
  const taken = topics.filter((t) => t.members >= t.capacity);
  return [
    `Темы «${list.title}» по дисциплине «${list.subjectName}» открыты для всех.`,
    free.length
      ? `Свободно ${free.length} из ${topics.length}:\n${free.map(name).join("\n")}`
      : "Свободных тем не осталось.",
    taken.length ? `Заняты: ${taken.map((t) => t.n).join(", ")}.` : null,
    list.deadline ? `Выбрать до ${list.deadline}.` : null,
    `Записаться: ${list.url}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export interface ExportRow {
  n: number;
  title: string;
  details: string | null;
  name: string;
  group: string;
}

/** The list as text for the group chat: «1. Тема — подтема: Иванова Анна (12)». */
export function listAsText(title: string, subjectName: string, rows: ExportRow[]): string {
  const byTopic = new Map<number, ExportRow[]>();
  for (const row of rows) byTopic.set(row.n, [...(byTopic.get(row.n) ?? []), row]);
  const lines = [...byTopic.values()].map((topicRows) => {
    const first = topicRows[0]!;
    const who = topicRows
      .filter((r) => r.name)
      .map((r) => (r.group ? `${r.name} (${r.group})` : r.name))
      .join(", ");
    return `${first.n}. ${first.title}${first.details ? ` — ${first.details}` : ""}: ${who || "свободна"}`;
  });
  return [`${title} · ${subjectName}`, ...lines].join("\n");
}
