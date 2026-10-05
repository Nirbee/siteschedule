import { describe, expect, it } from "vitest";
import { deviceLabel } from "./device-label";

describe("deviceLabel", () => {
  it.each([
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "iPhone · Safari",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "Windows · Chrome",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 YaBrowser/25.8 Mobile Safari/537.36",
      "Android · Яндекс Браузер",
    ],
    [null, "Неизвестное устройство"],
  ])("%s → %s", (ua, label) => {
    expect(deviceLabel(ua)).toBe(label);
  });
});
