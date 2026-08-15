import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompactStatStrip } from "./CompactStatStrip";

describe("CompactStatStrip", () => {
  it("renders one labelled summary rail without card wrappers", () => {
    const html = renderToStaticMarkup(
      <CompactStatStrip
        label="Runtime summary"
        stats={[
          { label: "Ready", value: 3, tone: "good" },
          {
            detail: "Needs attention",
            label: "Failures",
            value: 1,
            tone: "bad",
          },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Runtime summary"');
    expect(html).toContain("compact-stat-strip grid");
    expect(html).toContain("bg-[var(--good)]");
    expect(html).toContain("Needs attention");
    expect(html).toContain('title="Ready"');
    expect(html).toContain('title="3"');
    expect(html).toContain('title="Needs attention"');
    expect(html).not.toContain("metric-card");
  });
});
