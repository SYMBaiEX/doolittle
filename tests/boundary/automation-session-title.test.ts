import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { createAutomationExecutor } from "../../packages/agent/src/runtime/bootstrap/runtime/automation-executor";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { handleChatSubmitRoute } from "../../packages/agent/src/server/routes/conversation/chat";
import {
  automationRunSessionTitle,
  automationRunTimestamp,
} from "../../packages/agent/src/services/automation/session-title";
import { SessionService } from "../../packages/agent/src/services/session/service";
import type { AutomationJobRecord } from "../../packages/agent/src/types/index";

vi.mock("../../packages/agent/src/runtime/chat", () => ({
  handleAgentTurn: vi.fn(async () => "automation output"),
}));

function automationJob(overrides: Partial<AutomationJobRecord> = {}) {
  const now = new Date().toISOString();
  return {
    id: "4c3f2f3c-3f54-4f5f-9d63-1d7ac2b4d001",
    targetBotId: "default",
    name: "Overnight digest",
    prompt: "Summarize the repository.",
    schedule: "every 6h",
    skills: [],
    delivery: "local",
    status: "active",
    oneShot: false,
    createdAt: now,
    updatedAt: now,
    trigger: { type: "schedule", schedule: "every 6h" },
    action: { type: "prompt", prompt: "Summarize the repository." },
    ...overrides,
  } as AutomationJobRecord;
}

it("formats automation run titles from the display name and run timestamp", () => {
  const runAt = new Date(2026, 10, 25, 19, 4);
  expect(automationRunTimestamp(runAt)).toBe("2026-11-25 19:04");
  expect(automationRunSessionTitle("Overnight digest", runAt)).toBe(
    "Overnight digest · 2026-11-25 19:04",
  );
  // The timestamp survives truncation so long names still distinguish runs.
  const long = automationRunSessionTitle(
    "Heartbeat check with a very long prompt body that exercises wrapping in automation cards",
    runAt,
  );
  expect(Array.from(long).length).toBeLessThanOrEqual(64);
  expect(long).toMatch(/· 2026-11-25 19:04$/u);
  expect(long).toContain("…");
  // Control characters and empty names never leak into list rows.
  expect(automationRunSessionTitle("\u0007  \n", runAt)).toBe(
    "Automation · 2026-11-25 19:04",
  );
});

it("claims a generated session title once and never overwrites existing titles", () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-automation-claim-"));
  try {
    const sessions = new SessionService(directory);
    const sessionId = "automation:job";
    const first = automationRunSessionTitle(
      "Overnight digest",
      new Date(2026, 10, 25, 19, 4),
    );
    expect(sessions.claimSessionTitle(sessionId, first)).toBe(true);
    expect(sessions.metadata(sessionId)?.title).toBe(first);

    // Later runs of the same automation do not rewrite the claimed title.
    expect(
      sessions.claimSessionTitle(
        sessionId,
        automationRunSessionTitle("Overnight digest", new Date()),
      ),
    ).toBe(false);
    expect(sessions.metadata(sessionId)?.title).toBe(first);

    // A user rename is never overwritten by a later generated claim.
    sessions.rename("renamed-chat", "Operator title");
    expect(sessions.claimSessionTitle("renamed-chat", "Generated title")).toBe(
      false,
    );
    expect(sessions.metadata("renamed-chat")?.title).toBe("Operator title");

    // Empty claims are refused.
    expect(sessions.claimSessionTitle("empty-claim", "   ")).toBe(false);
    expect(sessions.metadata("empty-claim")).toBeUndefined();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("titles the automation conversation when a default-bot run executes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "doolittle-automation-run-"));
  try {
    const sessions = new SessionService(directory);
    const { handleAgentTurn } = await import(
      "../../packages/agent/src/runtime/chat"
    );
    const turn = vi.mocked(handleAgentTurn);
    turn.mockClear();
    const executor = createAutomationExecutor({
      config: {} as never,
      services: {
        sessions,
        settings: {
          get: () => ({
            model: { provider: "openai", model: "gpt-test" },
          }),
        },
      } as unknown as AgentExecutionContext["services"],
      runtime: {} as never,
      ensureGateway: () => {
        throw new Error("no gateway");
      },
    });
    const job = automationJob();
    const output = await executor(job, { source: "manual" });
    expect(output).toBe("automation output");
    expect(turn).toHaveBeenCalledOnce();

    const sessionId = `automation:${job.id}`;
    const title = sessions.metadata(sessionId)?.title;
    expect(title).toMatch(
      /^Overnight digest · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u,
    );

    // The turn still targets the automation conversation identity.
    expect(turn.mock.calls[0]?.[0]).toMatchObject({
      userId: `automation:${job.id}`,
      roomId: sessionId,
      source: "automation",
    });

    // A user rename survives the next run of the same automation.
    sessions.rename(sessionId, "Operator curated title");
    await executor(job, { source: "schedule" });
    expect(sessions.metadata(sessionId)?.title).toBe("Operator curated title");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("claims the automation run title when a chat run carries automationName", async () => {
  const directory = mkdtempSync(
    join(tmpdir(), "doolittle-automation-chat-run-"),
  );
  try {
    const sessions = new SessionService(directory);
    const sessionId = "automation:job-a:fire-a";
    const context = {
      config: { dataDir: directory, workspaceDir: directory },
      services: {
        sessions,
        // Reject the run after preparation; the title claim must already
        // have landed during run preparation, before any message persists.
        runController: {
          claimTaskRun: () => ({ accepted: false, reason: "run_exists" }),
        },
      },
    } as unknown as AppContext;
    const response = await handleChatSubmitRoute(
      context,
      new Request("http://localhost/chat/runs", {
        method: "POST",
        body: JSON.stringify({
          message: "Run the digest.",
          roomId: sessionId,
          source: "desktop-automation",
          automationName: "Overnight digest",
        }),
      }),
    );
    // The conflicting run is irrelevant here; the title was still claimed.
    expect(response?.status).toBe(409);
    expect(sessions.metadata(sessionId)?.title).toMatch(
      /^Overnight digest · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/u,
    );

    // A follow-up fire of the same automation never overwrites the title.
    const firstTitle = sessions.metadata(sessionId)?.title;
    await handleChatSubmitRoute(
      context,
      new Request("http://localhost/chat/runs", {
        method: "POST",
        body: JSON.stringify({
          message: "Run the digest again.",
          roomId: sessionId,
          source: "desktop-automation",
          automationName: "Overnight digest renamed later",
        }),
      }),
    );
    expect(sessions.metadata(sessionId)?.title).toBe(firstTitle);

    // Runs without an automation name never claim a title.
    await handleChatSubmitRoute(
      context,
      new Request("http://localhost/chat/runs", {
        method: "POST",
        body: JSON.stringify({
          message: "Ordinary chat.",
          roomId: "ordinary-room",
        }),
      }),
    );
    expect(sessions.metadata("ordinary-room")).toBeUndefined();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
