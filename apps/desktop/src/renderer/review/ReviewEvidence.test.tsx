import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewEvidence } from "./ReviewEvidence";

function renderEvidence(evidenceOpen: boolean, sourceControlOpen = false) {
  return renderToStaticMarkup(
    <ReviewEvidence
      active
      agentRunCount={0}
      branchEvents={[]}
      branchRecordError=""
      branches={[]}
      changedFileCount={0}
      changes={[]}
      checkSummary={{ failing: 0, passing: 0 }}
      conflicts={[]}
      evidenceOpen={evidenceOpen}
      onEvidenceOpenChange={() => undefined}
      onRefresh={() => undefined}
      onSourceControlOpenChange={() => undefined}
      openCommentCount={0}
      pendingCount={0}
      remotes={[]}
      repositoryReviewError=""
      sourceControlErrorCount={0}
      sourceControlLoading={false}
      sourceControlOpen={sourceControlOpen}
      stashes={[]}
      worktrees={[]}
    />,
  );
}

describe("ReviewEvidence", () => {
  it("keeps the heavy evidence body out of the closed drawer", () => {
    const html = renderEvidence(false);

    expect(html).toContain("Repository evidence");
    expect(html).not.toContain("Source control");
    expect(html).not.toContain("Git workspace");
  });

  it("keeps Git controls unmounted until their nested drawer opens", () => {
    const html = renderEvidence(true, false);

    expect(html).toContain("Source control · 0 changes");
    expect(html).not.toContain("Git workspace");
  });
});
