import { describe, expect, it } from "vitest";
import { contentDisposition } from "./serve";

describe("contentDisposition", () => {
  it("keeps Cyrillic names via filename*", () => {
    expect(contentDisposition("attachment", "Лекция 1.pdf")).toBe(
      `attachment; filename="______ 1.pdf"; filename*=UTF-8''%D0%9B%D0%B5%D0%BA%D1%86%D0%B8%D1%8F%201.pdf`,
    );
  });
});
