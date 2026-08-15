import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SkillWorkshopPanel } from "./SkillWorkshopPanel";
import {
  normalizeProposal,
  normalizeProposalStatus,
  proposalCanApprove,
  skillWorkshopLabelCounts,
} from "./skill-workshop-model";

describe("skill workshop helpers", () => {
  it("uses one quiet pressed-state control for each proposal filter", () => {
    const markup = renderToStaticMarkup(
      createElement(SkillWorkshopPanel, { active: true }),
    );

    expect(markup.match(/aria-pressed=/gu)).toHaveLength(4);
    expect(markup).toContain('aria-pressed="true"');
    expect(markup.match(/aria-pressed="true"/gu)).toHaveLength(1);
    expect(markup).not.toContain("Review before activation</h2>");
  });

  it("normalizes proposal statuses", () => {
    expect(normalizeProposalStatus("pending")).toBe("pending");
    expect(normalizeProposalStatus("approved")).toBe("approved");
    expect(normalizeProposalStatus("DENIED")).toBe("rejected");
    expect(normalizeProposalStatus("blocked")).toBe("unknown");
  });

  it("normalizes the durable backend proposal payload into a stable shape", () => {
    expect(
      normalizeProposal(
        {
          id: "proposal-1",
          slug: "release-operator",
          disposition: "pending",
          taskId: "task-release",
          safety: "warn",
          findings: [
            {
              outcome: "warn",
              code: "destructive-command",
              message: "Review the command before approval.",
            },
          ],
          content:
            "---\nname: release-operator\ndescription: Release safely.\n---",
        },
        0,
      ),
    ).toMatchObject({
      id: "proposal-1",
      slug: "release-operator",
      status: "pending",
      author: "task-release",
      safety: {
        blocked: false,
        badges: ["warn"],
        findings: ["destructive-command · Review the command before approval."],
      },
      content: "---\nname: release-operator\ndescription: Release safely.\n---",
    });
  });

  it("shows a pending proposal with a blocked safety result as blocked", () => {
    expect(
      normalizeProposal(
        {
          id: "proposal-2",
          slug: "unsafe-skill",
          disposition: "pending",
          safety: "blocked",
          findings: [{ code: "approval-bypass", message: "Unsafe." }],
        },
        1,
      ),
    ).toMatchObject({
      status: "blocked",
      safety: {
        blocked: true,
        badges: ["blocked"],
        findings: ["approval-bypass · Unsafe."],
      },
    });
  });

  it("counts proposal states across a queue", () => {
    expect(
      skillWorkshopLabelCounts([
        {
          id: "1",
          slug: "a",
          status: "pending",
          author: "",
          createdAt: "",
          reviewedAt: "",
          content: "",
          reason: "",
          safety: { blocked: false, badges: [], findings: [], reason: "" },
        },
        {
          id: "2",
          slug: "b",
          status: "approved",
          author: "",
          createdAt: "",
          reviewedAt: "",
          content: "",
          reason: "",
          safety: { blocked: false, badges: [], findings: [], reason: "" },
        },
        {
          id: "3",
          slug: "c",
          status: "blocked",
          author: "",
          createdAt: "",
          reviewedAt: "",
          content: "",
          reason: "",
          safety: { blocked: true, badges: [], findings: [], reason: "" },
        },
      ]),
    ).toEqual({
      pending: 1,
      approved: 1,
      rejected: 0,
      blocked: 1,
      total: 3,
    });
  });

  it("blocks approve for rejected or blocked proposals", () => {
    const blocked = {
      id: "1",
      slug: "a",
      status: "pending" as const,
      author: "",
      createdAt: "",
      reviewedAt: "",
      content: "",
      reason: "",
      safety: { blocked: true, badges: [], findings: [], reason: "" },
    };
    const approved = {
      id: "2",
      slug: "b",
      status: "approved" as const,
      author: "",
      createdAt: "",
      reviewedAt: "",
      content: "",
      reason: "",
      safety: { blocked: false, badges: [], findings: [], reason: "" },
    };

    expect(proposalCanApprove(blocked)).toBe(false);
    expect(proposalCanApprove(approved)).toBe(false);
  });
});
