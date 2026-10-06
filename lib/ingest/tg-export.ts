// Reading a Telegram Desktop chat export (result.json + photos/ + files/) of the course chat.
// Forum topics are not marked on messages: a message in a topic replies either to the topic's
// first message or to another message of the topic, so the topic is found by following replies
// (or from the media path, when the export was made from a single topic).
import { z } from "zod";

/** Topic of messages that reply to nothing in a forum («General»). */
export const GENERAL_TOPIC = 1;

const textPart = z.union([z.string(), z.object({ text: z.string() }).loose()]);

const exportMessage = z
  .object({
    id: z.number().int(),
    type: z.string(),
    date_unixtime: z.string().regex(/^\d+$/).optional(),
    date: z.string().optional(),
    from: z.string().nullable().optional(),
    from_id: z.string().optional(),
    reply_to_message_id: z.number().int().optional(),
    action: z.string().optional(),
    photo: z.string().optional(),
    file: z.string().optional(),
    file_name: z.string().optional(),
    media_type: z.string().optional(),
    text: z.union([z.string(), z.array(textPart)]).optional(),
  })
  .loose();
type ExportMessage = z.infer<typeof exportMessage>;

export const exportFile = z
  .object({
    id: z.number().int(),
    name: z.string().optional(),
    messages: z.array(exportMessage),
  })
  .loose();

export interface TgExportItem {
  messageId: number;
  topicId: number;
  postedAt: Date;
  authorId: number | null;
  authorName: string | null;
  caption: string;
  /** Path inside the export folder. */
  path: string;
  fileName: string;
}

export type SkipReason =
  | "no_media" // text, stickers, voice, video…
  | "not_downloaded" // the export was made without this file (size limit, settings)
  | "topic" // a topic we do not import (flood, other groups)
  | "too_early"; // before the semester

export interface ParsedExport {
  chatId: number; // as the Bot API sees it: -100…
  items: TgExportItem[];
  skipped: Record<SkipReason, number>;
  topics: Map<number, string>; // topic id → title (from «topic created» service messages)
}

const plainText = (text: ExportMessage["text"]) =>
  typeof text === "string"
    ? text
    : (text ?? []).map((part) => (typeof part === "string" ? part : part.text)).join("");

/** Telegram Desktop writes «(File not included…)» instead of a path for skipped files. */
const isRealPath = (path: string | undefined): path is string =>
  Boolean(path) && !path!.startsWith("(");

/** Media types we never import (only photos and documents are study materials). */
const SKIPPED_MEDIA = new Set([
  "sticker",
  "animation",
  "video_file",
  "video_message",
  "voice_message",
  "audio_file",
]);

const topicFromPath = (path: string): number | null => {
  const match = /(?:^|\/)topic_(\d+)\//.exec(path);
  return match ? Number(match[1]) : null;
};

export function parseExport(
  raw: unknown,
  { topics, since }: { topics: Set<number>; since: Date },
): ParsedExport {
  const file = exportFile.parse(raw);
  const byId = new Map(file.messages.map((m) => [m.id, m]));
  const topicTitles = new Map<number, string>();
  for (const m of file.messages) {
    if (m.type === "service" && m.action === "topic_created")
      topicTitles.set(m.id, String((m as { title?: unknown }).title ?? ""));
  }

  const topicCache = new Map<number, number>();
  const topicOf = (m: ExportMessage): number => {
    const cached = topicCache.get(m.id);
    if (cached !== undefined) return cached;
    let current: ExportMessage | undefined = m;
    let topic = GENERAL_TOPIC;
    for (let hops = 0; current && hops < 1000; hops++) {
      const parent = current.reply_to_message_id;
      if (parent === undefined) break;
      if (topicTitles.has(parent) || topics.has(parent)) {
        topic = parent;
        break;
      }
      current = byId.get(parent);
      if (!current) {
        // Replies to messages outside the export: the parent id may itself be a topic id.
        topic = parent;
        break;
      }
    }
    topicCache.set(m.id, topic);
    return topic;
  };

  const skipped: Record<SkipReason, number> = {
    no_media: 0,
    not_downloaded: 0,
    topic: 0,
    too_early: 0,
  };
  const items: TgExportItem[] = [];
  for (const m of file.messages) {
    if (m.type !== "message") continue;
    const path = m.photo ?? m.file;
    if ((!m.photo && !m.file) || (m.media_type && SKIPPED_MEDIA.has(m.media_type))) {
      skipped.no_media++;
      continue;
    }
    if (!isRealPath(path)) {
      skipped.not_downloaded++;
      continue;
    }
    // A topic export keeps media in «…/topic_16/photos/…»: the most reliable signal.
    const topicId = topicFromPath(path) ?? topicOf(m);
    if (!topics.has(topicId)) {
      skipped.topic++;
      continue;
    }
    const postedAt = m.date_unixtime
      ? new Date(Number(m.date_unixtime) * 1000)
      : new Date(m.date ?? 0);
    if (postedAt < since) {
      skipped.too_early++;
      continue;
    }
    const author = m.from_id ? /^user(\d+)$/.exec(m.from_id) : null;
    items.push({
      messageId: m.id,
      topicId,
      postedAt,
      authorId: author ? Number(author[1]) : null,
      authorName: m.from ?? null,
      caption: plainText(m.text),
      path,
      fileName: m.file_name ?? path.split("/").pop() ?? "photo.jpg",
    });
  }
  return {
    chatId: -(1_000_000_000_000 + file.id),
    items,
    skipped,
    topics: topicTitles,
  };
}
