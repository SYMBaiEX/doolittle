import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiResource } from "../lib";
import { hasMemorySnapshot, MemorySnapshotPanel } from "./MemorySnapshotPanel";
import type { MemoryResponse } from "./models";

function resource(data: MemoryResponse): ApiResource<MemoryResponse> {
  return {
    data,
    error: "",
    loading: false,
    reload: () => undefined,
  };
}

describe("MemorySnapshotPanel", () => {
  it("treats the bounded empty sentinel as absent memory", () => {
    expect(hasMemorySnapshot("MEMORY [0% — 0/2200 chars]\n(empty)", 0)).toBe(
      false,
    );
    expect(hasMemorySnapshot("Remember the operator preference", 0)).toBe(true);
  });

  it("collapses a truly empty memory target into one authoritative card", () => {
    const markup = renderToStaticMarkup(
      <MemorySnapshotPanel
        active
        resource={resource({
          summary: { characters: 0, entries: 0, preview: [], target: "memory" },
          snapshot: "",
        })}
        target="memory"
      />,
    );

    expect(markup).toContain("memory-empty-card");
    expect(markup).toContain("No stored entries yet");
    expect(markup).not.toContain("Recent entries");
    expect(markup).not.toContain("Readable snapshot");
    expect(markup).not.toContain("No snapshot");
  });

  it("retains recent entries and the bounded snapshot when content exists", () => {
    const markup = renderToStaticMarkup(
      <MemorySnapshotPanel
        active
        resource={resource({
          summary: {
            characters: 42,
            entries: 1,
            preview: ["Prefers concise updates"],
            target: "user",
          },
          snapshot: "Prefers concise updates",
        })}
        target="user"
      />,
    );

    expect(markup).not.toContain("memory-empty-card");
    expect(markup).toContain("Recent entries");
    expect(markup).toContain("Readable snapshot");
    expect(markup).toContain("Prefers concise updates");
  });

  it("does not allocate a preview card when only a readable snapshot exists", () => {
    const markup = renderToStaticMarkup(
      <MemorySnapshotPanel
        active
        resource={resource({
          summary: {
            characters: 24,
            entries: 0,
            preview: [],
            target: "memory",
          },
          snapshot: "Bounded runtime snapshot",
        })}
        target="memory"
      />,
    );

    expect(markup).not.toContain("Recent entries");
    expect(markup).toContain("Readable snapshot");
    expect(markup).toContain("Bounded runtime snapshot");
  });

  it("collapses a bounded empty sentinel into the single empty card", () => {
    const markup = renderToStaticMarkup(
      <MemorySnapshotPanel
        active
        resource={resource({
          summary: { characters: 0, entries: 0, preview: [], target: "memory" },
          snapshot: "MEMORY [0% — 0/2200 chars]\n(empty)",
        })}
        target="memory"
      />,
    );

    expect(markup).toContain("memory-empty-card");
    expect(markup).not.toContain("Readable snapshot");
    expect(markup).not.toContain("MEMORY [0%");
  });
});
