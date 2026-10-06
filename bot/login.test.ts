import { afterEach, describe, expect, it, vi } from "vitest";
import { LOGIN_REPLY_TTL_MS, linkKeyboard, scheduleDelete } from "./login";

afterEach(() => vi.useRealTimers());

describe("scheduleDelete", () => {
  it("deletes the message after the delay and ignores failures", async () => {
    vi.useFakeTimers();
    const deleteMessage = vi.fn().mockRejectedValue(new Error("message to delete not found"));
    scheduleDelete({ deleteMessage } as never, 42, 7);

    vi.advanceTimersByTime(LOGIN_REPLY_TTL_MS - 1);
    expect(deleteMessage).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(deleteMessage).toHaveBeenCalledWith(42, 7);
    await vi.runAllTimersAsync(); // the rejection is swallowed
  });
});

describe("linkKeyboard", () => {
  it("adds a button only for https links", () => {
    expect(linkKeyboard("Сайт", "http://localhost:3000")).toBeUndefined();
    expect(linkKeyboard("Сайт", "https://moyapara.ru")).toBeDefined();
  });
});
