import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillProposalCard } from "./SkillProposalCard";
import type { SkillProposal } from "./skill-workshop-model";

const proposal: SkillProposal = {
  id: "proposal-1",
  slug: "release-operator",
  status: "pending",
  author: "task-release",
  createdAt: "2026-08-12",
  reviewedAt: "",
  content: "# Release operator",
  reason: "",
  safety: {
    blocked: false,
    badges: ["warn"],
    findings: ["destructive-command · Review before approval."],
    reason: "Requires operator review.",
  },
};

const renderCard = (
  overrides: { isRejecting?: boolean; isSelected?: boolean } = {},
) =>
  renderToStaticMarkup(
    <SkillProposalCard
      actionBusy={false}
      isRejecting={overrides.isRejecting ?? false}
      isSelected={overrides.isSelected ?? false}
      onApprove={() => undefined}
      onReasonChange={() => undefined}
      onReject={() => undefined}
      onRejectToggle={() => undefined}
      onSelect={() => undefined}
      proposal={proposal}
      rejectionReason=""
    />,
  );

describe("SkillProposalCard", () => {
  it("keeps safety evidence available without expanding every proposal", () => {
    const html = renderCard();

    expect(html).toContain("<details");
    expect(html).toContain("Safety review");
    expect(html).not.toContain("Rejection note");
    expect(html).toContain("View SKILL.md");
  });

  it("reveals rejection input only during an explicit rejection", () => {
    const html = renderCard({ isRejecting: true, isSelected: true });

    expect(html).toContain("Rejection note");
    expect(html).toContain("Confirm rejection");
    expect(html).toContain("Hide SKILL.md");
  });
});
