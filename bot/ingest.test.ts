import { describe, expect, it } from "vitest";
import { GENERAL_TOPIC, pickFile, topicOf } from "./ingest";

describe("topicOf", () => {
  it("uses the thread of topic messages, «General» otherwise", () => {
    expect(topicOf({ is_topic_message: true, message_thread_id: 16 })).toBe(16);
    expect(topicOf({ message_thread_id: 16 })).toBe(GENERAL_TOPIC); // a reply thread in General
    expect(topicOf({})).toBe(GENERAL_TOPIC);
  });
});

describe("pickFile", () => {
  const size = (file_id: string, width: number, file_size?: number) => ({
    file_id,
    file_unique_id: file_id,
    width,
    height: width,
    file_size,
  });

  it("takes the largest photo", () => {
    expect(
      pickFile({
        message_id: 7,
        photo: [size("s", 90, 1000), size("l", 1280, 90000), size("m", 320, 9000)],
      }),
    ).toEqual({ fileId: "l", fileName: "photo_7.jpg" });
  });

  it("takes documents, skips GIFs, video, audio and files over 20 MB", () => {
    const doc = (o: object) => ({ file_id: "d", file_unique_id: "d", ...o });
    expect(
      pickFile({
        message_id: 8,
        document: doc({ file_name: "Вопросы.pdf", mime_type: "application/pdf" }),
      }),
    ).toEqual({
      fileId: "d",
      fileName: "Вопросы.pdf",
    });
    expect(pickFile({ message_id: 9, document: doc({ mime_type: "video/mp4" }) })).toBeNull();
    expect(
      pickFile({
        message_id: 9,
        document: doc({}),
        animation: { ...doc({}), width: 1, height: 1, duration: 1 },
      }),
    ).toBeNull();
    expect(pickFile({ message_id: 9, document: doc({ file_size: 25 * 1024 * 1024 }) })).toBeNull();
    expect(pickFile({ message_id: 10 })).toBeNull();
  });
});
