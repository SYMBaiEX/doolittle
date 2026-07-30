import { describe, expect, it } from "vitest";

import { buildOfflineMediaTextResponse } from "./backends";

describe("media request backends", () => {
  it("builds a deterministic offline fallback", () => {
    const fallback = buildOfflineMediaTextResponse("Prompt text", {
      focus: "voice",
      inspection: {
        kind: "audio",
        textPreview: "Preview text",
        transcriptPreview: "Transcript preview",
        captionPreview: "Caption preview",
      } as never,
      signals: ["Kind: audio", "Exists: true"],
    });
    expect(fallback).toContain("Offline analysis for voice.");
    expect(fallback).toContain("Signals: Kind: audio; Exists: true");
    expect(fallback).toContain("Prompt text");
  });
});
