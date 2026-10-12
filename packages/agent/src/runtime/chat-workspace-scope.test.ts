import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RoomHandlerQueue } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const { requestWorkerHost, prepareTurnState, runPostCommandTurn } = vi.hoisted(
  () => ({
    requestWorkerHost: vi.fn(),
    prepareTurnState: vi.fn(),
    runPostCommandTurn: vi.fn(),
  }),
);
vi.mock("@/runtime/bootstrap/worker-host-rpc", () => ({ requestWorkerHost }));
vi.mock("@/runtime/chat-turn/state", () => ({ prepareTurnState }));
vi.mock("@/runtime/chat-turn/post-command", () => ({ runPostCommandTurn }));

import { resolveWorkspaceDirectory } from "@/services/workspace-directory";
import { handleAgentTurn } from "./chat";

const priorDesktop = process.env.DOOLITTLE_DESKTOP_RUNTIME;
const roots: string[] = [];
afterEach(() => {
  if (priorDesktop === undefined) delete process.env.DOOLITTLE_DESKTOP_RUNTIME;
  else process.env.DOOLITTLE_DESKTOP_RUNTIME = priorDesktop;
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
  vi.resetAllMocks();
});

describe("queued desktop chat workspace scopes", () => {
  it("re-enters the proper host root for simultaneous rooms and a queued follow-up", async () => {
    process.env.DOOLITTLE_DESKTOP_RUNTIME = "1";
    const first = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-queue-a-")),
    );
    const second = realpathSync(
      mkdtempSync(join(tmpdir(), "doolittle-queue-b-")),
    );
    roots.push(first, second);
    requestWorkerHost.mockImplementation(async (_operation, payload) => ({
      sessionId: payload.sessionId,
      botId: "bot",
      workspacePath: payload.sessionId === "chat-a" ? first : second,
    }));
    prepareTurnState.mockImplementation((input) => ({
      turn: {
        roomId: input.roomId,
        sessionId: input.roomId,
        runId: input.message,
      },
      scheduleProfileObservation: () => undefined,
    }));
    runPostCommandTurn.mockImplementation(async () => {
      await Promise.resolve();
      return resolveWorkspaceDirectory("/fallback");
    });
    const context = {
      config: { workspaceDir: "/fallback" },
      runtime: { roomHandlerQueue: new RoomHandlerQueue() },
      services: {
        workspace: { root: () => resolveWorkspaceDirectory("/fallback") },
      },
    } as never;
    const turn = (roomId: string, message: string) =>
      handleAgentTurn({ userId: "user", roomId, message }, context, {
        admissionLease: null,
      });
    await expect(
      Promise.all([
        turn("chat-a", "first"),
        turn("chat-b", "second"),
        turn("chat-a", "follow-up"),
      ]),
    ).resolves.toEqual([first, second, first]);
    expect(requestWorkerHost).toHaveBeenCalledTimes(3);
  });
});
