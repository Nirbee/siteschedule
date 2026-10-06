import { describe, expect, it } from "vitest";
import { GENERAL_TOPIC, parseExport } from "./tg-export";

const IMPORTANT = 2;
const FLOOD = 4;
const OURS = 16;
const unix = (iso: string) => String(Date.parse(iso) / 1000);

const raw = {
  id: 4278419875,
  name: "Курс",
  messages: [
    {
      id: 2,
      type: "service",
      action: "topic_created",
      title: "Важное",
      date_unixtime: unix("2026-08-01T10:00:00Z"),
    },
    {
      id: 4,
      type: "service",
      action: "topic_created",
      title: "Флуд",
      date_unixtime: unix("2026-08-01T10:00:00Z"),
    },
    {
      id: 16,
      type: "service",
      action: "topic_created",
      title: "11М и 12М",
      date_unixtime: unix("2026-08-01T10:00:00Z"),
    },
    // Photo in «11М и 12М», author and caption with formatting.
    {
      id: 100,
      type: "message",
      date_unixtime: unix("2026-09-30T14:20:00Z"),
      from: "Яна",
      from_id: "user111",
      reply_to_message_id: OURS,
      photo: "photos/photo_1.jpg",
      text: ["Слайды ", { type: "bold", text: "ЗИС" }],
    },
    // A reply inside the same topic: found through the chain.
    {
      id: 101,
      type: "message",
      date_unixtime: unix("2026-09-30T14:25:00Z"),
      from_id: "user222",
      reply_to_message_id: 100,
      file: "files/Вопросы.pdf",
      file_name: "Вопросы.pdf",
      text: "",
    },
    // Flood, sticker, file not downloaded, before the semester, General.
    {
      id: 102,
      type: "message",
      date_unixtime: unix("2026-09-30T15:00:00Z"),
      reply_to_message_id: FLOOD,
      photo: "photos/meme.jpg",
    },
    {
      id: 103,
      type: "message",
      date_unixtime: unix("2026-09-30T15:00:00Z"),
      reply_to_message_id: OURS,
      file: "stickers/s.webp",
      media_type: "sticker",
    },
    {
      id: 104,
      type: "message",
      date_unixtime: unix("2026-09-30T15:00:00Z"),
      reply_to_message_id: IMPORTANT,
      file: "(File not included. Change data exporting settings to download.)",
      file_name: "big.zip",
    },
    {
      id: 105,
      type: "message",
      date_unixtime: unix("2026-08-20T15:00:00Z"),
      reply_to_message_id: IMPORTANT,
      photo: "photos/old.jpg",
    },
    {
      id: 106,
      type: "message",
      date_unixtime: unix("2026-09-30T16:00:00Z"),
      photo: "photos/general.jpg",
      text: "",
    },
    {
      id: 107,
      type: "message",
      date_unixtime: unix("2026-09-30T16:00:00Z"),
      reply_to_message_id: OURS,
      text: "просто текст",
    },
  ],
};

describe("parseExport", () => {
  const parsed = parseExport(raw, {
    topics: new Set([GENERAL_TOPIC, IMPORTANT, OURS]),
    since: new Date("2026-08-31T00:00:00+03:00"),
  });

  it("uses the Bot API chat id", () => {
    expect(parsed.chatId).toBe(-1004278419875);
  });

  it("finds the topic through replies and keeps photos and files", () => {
    expect(parsed.items).toEqual([
      {
        messageId: 100,
        topicId: OURS,
        postedAt: new Date("2026-09-30T14:20:00Z"),
        authorId: 111,
        authorName: "Яна",
        caption: "Слайды ЗИС",
        path: "photos/photo_1.jpg",
        fileName: "photo_1.jpg",
      },
      expect.objectContaining({ messageId: 101, topicId: OURS, fileName: "Вопросы.pdf" }),
      expect.objectContaining({ messageId: 106, topicId: GENERAL_TOPIC }),
    ]);
  });

  it("counts what it skipped", () => {
    expect(parsed.skipped).toEqual({ no_media: 2, not_downloaded: 1, topic: 1, too_early: 1 });
    expect(parsed.topics.get(FLOOD)).toBe("Флуд");
  });
});

describe("topic export", () => {
  it("takes the topic from the media path", () => {
    const parsed = parseExport(
      {
        id: 1,
        messages: [
          {
            id: 500,
            type: "message",
            date_unixtime: unix("2026-09-30T14:20:00Z"),
            reply_to_message_id: 398, // a message outside the export
            photo: "chats/chat_1/topic_16/photos/photo_1.jpg",
          },
        ],
      },
      { topics: new Set([16]), since: new Date("2026-08-31T00:00:00+03:00") },
    );
    expect(parsed.items.map((i) => [i.messageId, i.topicId])).toEqual([[500, 16]]);
  });
});
