import { describe, expect, it } from "vitest";
import type { AppContext } from "@/runtime/bootstrap";
import { handleSkillSynthesisRoutes } from "./skill-synthesis";

function createContext(): AppContext {
  const tasks = new Map(
    ["task-1", "task-2"].map((id) => [
      id,
      {
        id,
        title: id === "task-1" ? "Investigate" : "Ship",
        kind: "coding",
        status: "open",
        priority: "normal",
        paused: false,
        originalRequest: id,
        summary: undefined,
        sessionCount: 0,
        activeSessionCount: 0,
        latestSessionId: null,
        latestWorkdir: null,
        createdAt: "2026-07-28T00:00:00.000Z",
        updatedAt: "2026-07-28T00:00:00.000Z",
        closedAt: null,
        goal: id,
        parentTaskId: null,
        acceptanceCriteria: [],
        providerPolicy: null,
        metadata: {},
        sessions: [],
        messages: [],
        events: [],
      },
    ]),
  );
  return {
    runtime: {
      getService: (name: string) =>
        name === "ORCHESTRATOR_TASK_SERVICE"
          ? {
              getTask: async (id: string) => tasks.get(id) ?? null,
            }
          : null,
    },
    services: {
      skillSynthesis: {
        synthesizeFromTask: (task: { id: string }) => `generated:${task.id}`,
        listProposals: () => [],
      },
    },
  } as unknown as AppContext;
}

function proposalContent(slug = "browser-capture-workflow"): string {
  return `---
name: ${slug}
description: Capture a browser page safely.
---

# Browser Capture Workflow

## Procedure
1. Capture the page.`;
}

describe("handleSkillSynthesisRoutes", () => {
  it("keeps generated skill synthesis product-owned", async () => {
    const localResponse = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({ taskId: "task-2" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );

    await expect(localResponse?.json()).resolves.toEqual({
      path: "generated:task-2",
    });
  });

  it("validates required task ids and missing tasks", async () => {
    const missingTaskId = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );
    const missingTask = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/synthesize", {
        method: "POST",
        body: JSON.stringify({ taskId: "missing" }),
        headers: { "content-type": "application/json" },
      }),
      new URL("http://localhost/skills/synthesize"),
    );

    expect(missingTaskId?.status).toBe(400);
    await expect(missingTaskId?.json()).resolves.toEqual({
      error: "taskId is required",
    });
    expect(missingTask?.status).toBe(404);
    await expect(missingTask?.json()).resolves.toEqual({
      error: "Delegation task not found",
    });
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/not-synthesize"),
      new URL("http://localhost/not-synthesize"),
    );

    expect(response).toBeNull();
  });

  it("creates, lists, reads, and approves local skill proposals", async () => {
    const proposals: Array<Record<string, unknown>> = [];
    const base = createContext();
    const context = {
      ...base,
      services: {
        ...base.services,
        skillSynthesis: {
          synthesizeFromTask: (task: { id: string }) => `generated:${task.id}`,
          createProposal: (input: Record<string, unknown>) => {
            const proposal = {
              id: "skill-proposal-12345678-1234-1234-1234-123456789abc",
              ...input,
              disposition: "pending",
            };
            proposals.push(proposal);
            return proposal;
          },
          listProposals: () => proposals,
          getProposal: (id: string) =>
            proposals.find((proposal) => proposal.id === id),
          approveProposal: (id: string) => ({
            kind: "approved" as const,
            idempotent: false,
            proposal: {
              ...proposals.find((proposal) => proposal.id === id),
              disposition: "approved",
            },
          }),
          rejectProposal: (id: string) => ({
            kind: "rejected" as const,
            idempotent: false,
            proposal: {
              ...proposals.find((proposal) => proposal.id === id),
              disposition: "rejected",
            },
          }),
        },
      },
    } as unknown as AppContext;
    const created = await handleSkillSynthesisRoutes(
      context,
      new Request("http://localhost/skills/proposals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug: "browser-capture-workflow",
          content: proposalContent(),
        }),
      }),
      new URL("http://localhost/skills/proposals"),
    );
    expect(created?.status).toBe(201);
    const createdBody = (await created?.json()) as { proposal: { id: string } };

    const listed = await handleSkillSynthesisRoutes(
      context,
      new Request("http://localhost/skills/proposals"),
      new URL("http://localhost/skills/proposals"),
    );
    await expect(listed?.json()).resolves.toMatchObject({
      proposals: [{ disposition: "pending" }],
    });

    const detailUrl = new URL(
      `http://localhost/skills/proposals/${createdBody.proposal.id}`,
    );
    const detail = await handleSkillSynthesisRoutes(
      context,
      new Request(detailUrl),
      detailUrl,
    );
    await expect(detail?.json()).resolves.toMatchObject({
      proposal: { disposition: "pending" },
    });

    const approveUrl = new URL(
      `http://localhost/skills/proposals/${createdBody.proposal.id}/approve`,
    );
    const approved = await handleSkillSynthesisRoutes(
      context,
      new Request(approveUrl, { method: "POST", body: "{}" }),
      approveUrl,
    );
    await expect(approved?.json()).resolves.toMatchObject({
      idempotent: false,
      proposal: { disposition: "approved" },
    });
  });

  it("validates proposal payloads before dispatch", async () => {
    const response = await handleSkillSynthesisRoutes(
      createContext(),
      new Request("http://localhost/skills/proposals", {
        method: "POST",
        body: JSON.stringify({ slug: "missing-content" }),
      }),
      new URL("http://localhost/skills/proposals"),
    );
    expect(response?.status).toBe(400);
    await expect(response?.json()).resolves.toEqual({
      error: "slug and content are required",
    });
  });
});
