import { describe, expect, it } from "bun:test";
import {
  decodeJwtPayload,
  isUnixMillisecondsExpiring,
  isUnixSecondsExpiring,
  resolveHome,
} from "./shared";

describe("account-auth shared helpers", () => {
  it("prefers explicit home paths and otherwise falls back to HOME", () => {
    const previous = process.env.HOME;
    process.env.HOME = "/tmp/env-home";
    try {
      expect(resolveHome("/tmp/explicit-home")).toBe("/tmp/explicit-home");
      expect(resolveHome()).toBe("/tmp/env-home");
    } finally {
      if (previous === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previous;
      }
    }
  });

  it("decodes JWT payloads and ignores malformed tokens", () => {
    const payload = Buffer.from(
      JSON.stringify({ sub: "operator", exp: 123 }),
    ).toString("base64url");

    expect(decodeJwtPayload(`header.${payload}.sig`)).toEqual({
      exp: 123,
      sub: "operator",
    });
    expect(decodeJwtPayload("nope")).toBeUndefined();
  });

  it("treats close unix-second expirations as expiring within the skew window", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(isUnixSecondsExpiring(now + 30, 120)).toBe(true);
    expect(isUnixSecondsExpiring(now + 3600, 120)).toBe(false);
  });

  it("treats close unix-millisecond expirations as expiring within the skew window", () => {
    const now = Date.now();
    expect(isUnixMillisecondsExpiring(now + 30_000, 120)).toBe(true);
    expect(isUnixMillisecondsExpiring(now + 3_600_000, 120)).toBe(false);
  });
});
