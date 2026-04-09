import { describe, expect, it } from "bun:test";

import {
  buildMediaRelatedFileCandidates,
  buildMediaSidecarCandidates,
} from "./media-sidecars";

describe("media-sidecars", () => {
  it("builds decision-local sidecar candidate lists", () => {
    const audioCandidates = buildMediaSidecarCandidates(
      "/tmp/meeting.wav",
      "audio",
    );
    expect(audioCandidates.transcriptCandidates).toEqual([
      "/tmp/meeting.txt",
      "/tmp/meeting.md",
      "/tmp/meeting.transcript.txt",
      "/tmp/meeting.srt",
      "/tmp/meeting.vtt",
    ]);
    expect(audioCandidates.captionCandidates).toEqual([]);

    const imageCandidates = buildMediaSidecarCandidates(
      "/tmp/icon.png",
      "image",
    );
    expect(imageCandidates.captionCandidates).toEqual([
      "/tmp/icon.txt",
      "/tmp/icon.md",
      "/tmp/icon.caption.txt",
      "/tmp/icon.alt.txt",
    ]);
    expect(imageCandidates.transcriptCandidates).toEqual([]);
  });

  it("builds related file candidates without the source path", () => {
    expect(buildMediaRelatedFileCandidates("/tmp/meeting.wav")).toEqual([
      "/tmp/meeting.txt",
      "/tmp/meeting.md",
      "/tmp/meeting.caption.txt",
      "/tmp/meeting.alt.txt",
      "/tmp/meeting.transcript.txt",
      "/tmp/meeting.srt",
      "/tmp/meeting.vtt",
    ]);
  });
});
