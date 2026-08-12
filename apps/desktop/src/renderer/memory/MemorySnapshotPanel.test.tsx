import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ApiResource } from "../lib";
import { MemorySnapshotPanel } from "./MemorySnapshotPanel";
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
});
