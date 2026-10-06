import type { Context } from "grammy";
import type { Message } from "grammy/types";
import { MAX_CHAT_FILE_BYTES } from "@/lib/bot-api/contract";
import type { SiteClient } from "./site-client";

/** Messages of a forum's «General» have no thread id. */
export const GENERAL_TOPIC = 1;

export function topicOf(message: Pick<Message, "is_topic_message" | "message_thread_id">): number {
  return message.is_topic_message && message.message_thread_id
    ? message.message_thread_id
    : GENERAL_TOPIC;
}

export interface ChatFile {
  fileId: string;
  fileName: string;
}

/**
 * The file worth importing: the largest photo size, or a document that is not a GIF, video or
 * audio. null for everything else and for files the Bot API cannot download (>20 MB).
 */
export function pickFile(
  message: Pick<Message, "message_id" | "photo" | "document" | "animation">,
): ChatFile | null {
  if (message.photo?.length) {
    const largest = message.photo.reduce((a, b) =>
      (b.file_size ?? b.width * b.height) > (a.file_size ?? a.width * a.height) ? b : a,
    );
    if ((largest.file_size ?? 0) > MAX_CHAT_FILE_BYTES) return null;
    return { fileId: largest.file_id, fileName: `photo_${message.message_id}.jpg` };
  }
  const doc = message.document;
  if (!doc || message.animation) return null;
  if (/^(video|audio)\//.test(doc.mime_type ?? "")) return null;
  if ((doc.file_size ?? 0) > MAX_CHAT_FILE_BYTES) return null;
  return { fileId: doc.file_id, fileName: doc.file_name ?? `file_${message.message_id}` };
}

/**
 * New photo/document in the course chat: downloaded and sent to the site, which sorts it.
 * The bot never replies or deletes anything in the group.
 */
export async function handleChatMedia(
  ctx: Context,
  {
    site,
    chatId,
    topics,
    token,
  }: { site: SiteClient; chatId: number; topics: Set<number>; token: string },
): Promise<void> {
  const message = ctx.message;
  if (!message || ctx.chat?.id !== chatId) return;
  const topic = topicOf(message);
  if (!topics.has(topic)) return;
  const file = pickFile(message);
  if (!file) return;

  try {
    const info = await ctx.api.getFile(file.fileId);
    if (!info.file_path) return;
    // The URL contains the bot token: never log it.
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`download failed: ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const from = message.from;
    const result = await site.ingestChat({
      chatId,
      messageId: message.message_id,
      threadId: topic,
      mediaGroupId: message.media_group_id ?? null,
      author:
        from && !from.is_bot
          ? { id: from.id, name: [from.first_name, from.last_name].filter(Boolean).join(" ") }
          : null,
      caption: message.caption ?? "",
      postedAt: message.date,
      fileName: file.fileName,
      data: bytes.toString("base64"),
    });
    console.info(`[bot] chat file ${message.message_id}: ${result.status} → ${result.placement}`);
  } catch (error) {
    console.warn(
      `[bot] chat file ${message.message_id} not imported:`,
      error instanceof Error ? error.message : "error",
    );
  }
}
