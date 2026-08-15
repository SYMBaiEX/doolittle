import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewOverview } from "./ReviewOverview";

const emptyWorkState = {
  tone: "neutral" as const,
  icon: "○",
  title: "No completed work yet",
  detail:
    "Completed agent runs, changed files, checks, and decisions will collect here.",
};

describe("ReviewOverview", () => {
  it("keeps the zero-work outcome compact without repeating empty metrics", () => {
    const markup = renderToStaticMarkup(
      <ReviewOverview
        agentRunCount={0}
        changedFileCount={0}
        checksPassing={0}
        empty
        openCommentCount={0}
        workState={emptyWorkState}
      />,
    );

    expect(markup).toContain('data-review-empty="true"');
    expect(markup).toContain("Review ready");
    expect(markup).toContain("No completed work yet");
    expect(markup).not.toContain("review-work-metrics");
    expect(markup).not.toContain("review-work-revision");
  });

  it("retains evidence metrics and revision for completed work", () => {
    const markup = renderToStaticMarkup(
      <ReviewOverview
        agentRunCount={2}
        changedFileCount={4}
        checksPassing={3}
        openCommentCount={1}
        reviewBranch="sym/clean-review"
        reviewHead="1234567890abcdef"
        workState={{
          tone: "good",
          icon: "✓",
          title: "Ready for your review",
          detail: "Doolittle completed two runs.",
        }}
      />,
    );

    expect(markup).toContain("review-work-metrics");
    expect(markup).toContain("review-work-revision");
    expect(markup).toContain("sym/clean-review");
    expect(markup).toContain("1234567890ab");
  });
});
