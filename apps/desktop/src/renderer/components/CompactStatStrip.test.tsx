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

  it("uses two columns through the 920px narrow viewport before collapsing at 540px", () => {
    const html = renderToStaticMarkup(
      <CompactStatStrip
        label="Workspace summary"
        stats={[{ label: "Workspace branch", value: "main" }]}
      />,
    );

    expect(html).toContain("max-[960px]:grid-cols-2");
    expect(html).toContain("max-[960px]:even:border-r-0");
    expect(html).toContain("max-[960px]:[&amp;:nth-child(n+3)]:border-t");
    expect(html).toContain("max-[540px]:grid-cols-1");
    expect(html).not.toContain("max-[920px]:");
  });
});
