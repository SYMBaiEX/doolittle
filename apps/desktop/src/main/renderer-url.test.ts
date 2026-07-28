import { describe, expect, it } from "vitest";
import {
  isTrustedRendererNavigation,
  trustedDevRendererUrl,
} from "./renderer-url";

describe("trustedDevRendererUrl", () => {
  it("accepts loopback HTTP only in development", () => {
    expect(
      trustedDevRendererUrl("http://127.0.0.1:5173/some-path", false),
    ).toBe("http://127.0.0.1:5173");
    expect(trustedDevRendererUrl("http://localhost:5173", false)).toBe(
      "http://localhost:5173",
    );
    expect(trustedDevRendererUrl("https://attacker.example", false)).toBe(
      undefined,
    );
  });

  it("ignores every renderer override in packaged builds", () => {
    expect(
      trustedDevRendererUrl("http://127.0.0.1:5173", true),
    ).toBeUndefined();
  });
});

describe("isTrustedRendererNavigation", () => {
  it("allows only the exact configured development origin", () => {
    const origin = "http://127.0.0.1:5173";
    expect(
      isTrustedRendererNavigation("http://127.0.0.1:5173/#/chat", origin),
    ).toBe(true);
    expect(
      isTrustedRendererNavigation("http://127.0.0.1:5173.evil.test", origin),
    ).toBe(false);
    expect(isTrustedRendererNavigation("https://127.0.0.1:5173", origin)).toBe(
      false,
    );
  });
});
