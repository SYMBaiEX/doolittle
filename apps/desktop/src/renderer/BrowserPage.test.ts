import { describe, expect, it } from "vitest";
import { isLocalPreviewUrl } from "./BrowserPage";

describe("isLocalPreviewUrl", () => {
  it("permits only localhost preview hosts", () => {
    expect(isLocalPreviewUrl("http://localhost:3000")).toBe(true);
    expect(isLocalPreviewUrl("https://127.0.0.1:8443")).toBe(true);
  });

  it("rejects non-local, malformed, and lookalike hosts", () => {
    expect(isLocalPreviewUrl("https://example.test")).toBe(false);
    expect(isLocalPreviewUrl("http://localhost.example.test")).toBe(false);
    expect(isLocalPreviewUrl("http://[::1]:3000")).toBe(false);
    expect(isLocalPreviewUrl("not a URL")).toBe(false);
  });
});
