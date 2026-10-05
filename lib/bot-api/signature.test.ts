import { describe, expect, it } from "vitest";
import { MAX_SKEW_SECONDS, sign, verify } from "./signature";

const secret = "s".repeat(48);
const now = 1_790_000_000;
const request = { method: "POST", path: "/api/bot/health", body: '{"ping":1}' };

function signed(overrides: Partial<{ timestamp: number; secret: string }> = {}) {
  const timestamp = overrides.timestamp ?? now;
  return {
    timestampHeader: String(timestamp),
    signatureHeader: sign({ secret: overrides.secret ?? secret, timestamp, ...request }),
  };
}

describe("bot API signature", () => {
  it("accepts a valid request", () => {
    expect(verify({ secret, now, ...request, ...signed() })).toEqual({ ok: true });
  });

  it("accepts lowercase method on either side", () => {
    const headers = signed();
    expect(verify({ secret, now, ...request, method: "post", ...headers })).toEqual({ ok: true });
  });

  it("rejects missing headers", () => {
    expect(
      verify({ secret, now, ...request, timestampHeader: null, signatureHeader: null }),
    ).toEqual({ ok: false, reason: "missing" });
  });

  it("rejects stale and future timestamps", () => {
    for (const shift of [-(MAX_SKEW_SECONDS + 1), MAX_SKEW_SECONDS + 1]) {
      const headers = signed({ timestamp: now + shift });
      expect(verify({ secret, now, ...request, ...headers })).toEqual({
        ok: false,
        reason: "stale",
      });
    }
  });

  it("rejects a wrong secret", () => {
    const headers = signed({ secret: "x".repeat(48) });
    expect(verify({ secret, now, ...request, ...headers })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("rejects a tampered body, path or method", () => {
    const headers = signed();
    for (const tampered of [
      { ...request, body: '{"ping":2}' },
      { ...request, path: "/api/bot/outbox/claim" },
      { ...request, method: "GET" },
    ]) {
      expect(verify({ secret, now, ...tampered, ...headers })).toEqual({
        ok: false,
        reason: "mismatch",
      });
    }
  });

  it("rejects a malformed signature without throwing", () => {
    const headers = { ...signed(), signatureHeader: "not-hex" };
    expect(verify({ secret, now, ...request, ...headers })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });
});
