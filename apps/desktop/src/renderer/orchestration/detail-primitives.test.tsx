import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  DetailRow,
  DetailTag,
  SmallEmpty,
  statusTone,
} from "./detail-primitives";

describe("orchestration detail primitives", () => {
  it("preserves detail markup and tone classes", () => {
    const markup = renderToStaticMarkup(
      <div>
        <DetailRow label="Status" value="running" />
        <DetailTag tone="good">Healthy</DetailTag>
        <SmallEmpty>No evidence</SmallEmpty>
      </div>,
    );

    expect(markup).toContain("orchestration-detail-row");
    expect(markup).toContain("<dt>Status</dt><dd>running</dd>");
    expect(markup).toContain("orchestration-detail-tag");
    expect(markup).toContain("good");
    expect(markup).toContain("orchestration-empty-line");
  });

  it("maps shared orchestration statuses consistently", () => {
    expect(statusTone("completed")).toBe("good");
    expect(statusTone("stalled")).toBe("bad");
    expect(statusTone("pending")).toBe("warn");
    expect(statusTone("unknown")).toBe("neutral");
  });
});
