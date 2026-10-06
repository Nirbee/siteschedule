// New photos/files from the course chat, sent by the bot: same intake and auto-sorting as the
// history import. A batch (album, or one author's messages ≤2 min apart) shares captions.
import { and, eq, gte, isNotNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { media } from "@/lib/db/schema";
import type { ChatIngestRequest, ChatIngestResponse } from "@/lib/bot-api/contract";
import { ingest } from "@/lib/ingest/ingest";
import { decideBatch, forReview } from "@/lib/ingest/sort";
import { env } from "@/lib/env";
import { guessKind, loadSortContext, targetFor } from "./tg-import";

const BATCH_WINDOW_MS = 2 * 60_000;

/** Captions of earlier messages of the same batch (they may carry the subject name). */
async function batchCaptions(request: ChatIngestRequest, postedAt: Date): Promise<string[]> {
  const sameAlbum = request.mediaGroupId
    ? eq(media.tgMediaGroupId, request.mediaGroupId)
    : undefined;
  const sameAuthor = request.author
    ? and(
        eq(media.tgAuthorId, request.author.id),
        gte(media.postedAt, new Date(+postedAt - BATCH_WINDOW_MS)),
        lte(media.postedAt, postedAt),
      )
    : undefined;
  if (!sameAlbum && !sameAuthor) return [];
  const rows = await db()
    .select({ caption: media.caption })
    .from(media)
    .where(
      and(eq(media.tgChatId, request.chatId), isNotNull(media.caption), or(sameAlbum, sameAuthor)),
    );
  return rows.map((r) => r.caption!).filter(Boolean);
}

export async function ingestFromChat(request: ChatIngestRequest): Promise<ChatIngestResponse> {
  const ctx = await loadSortContext();
  const postedAt = new Date(request.postedAt * 1000);
  const captions = [request.caption, ...(await batchCaptions(request, postedAt))].join(" ");
  const kind = guessKind(request.fileName);
  const [decision] = ctx
    ? decideBatch(
        [
          {
            kind,
            caption: captions,
            fileName: request.fileName,
            postedAt,
            authorId: request.author?.id ?? null,
            mediaGroupId: request.mediaGroupId,
          },
        ],
        ctx,
      )
    : [];
  const reviewed =
    decision && env().INGEST_REVIEW_TOPICS.includes(request.threadId)
      ? forReview(decision)
      : decision;
  const target = reviewed
    ? targetFor(reviewed)
    : ({
        type: "unsorted",
        suggestion: { subjectId: null, date: null, slotN: null },
        reason: "расписание не настроено",
      } as const);

  const result = await ingest({
    bytes: Buffer.from(request.data, "base64"),
    fileName: request.fileName,
    target,
    uploaderId: null,
    source: "tg_bot",
    postedAt,
    telegram: {
      chatId: request.chatId,
      messageId: request.messageId,
      threadId: request.threadId,
      mediaGroupId: request.mediaGroupId,
      authorId: request.author?.id ?? null,
      authorName: request.author?.name ?? null,
      caption: request.caption || null,
    },
  });
  return {
    status: result.status,
    placement:
      result.status === "created"
        ? target.type === "lesson"
          ? "lesson"
          : target.type === "materials"
            ? "materials"
            : "unsorted"
        : null,
  };
}
