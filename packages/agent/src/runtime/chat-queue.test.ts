import { RoomHandlerQueue } from "@elizaos/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stableRuntimeUuid } from "@/runtime/stable-runtime-uuid";

const { prepareTurnState, runPostCommandTurn } = vi.hoisted(() => ({
  prepareTurnState: vi.fn(),
  runPostCommandTurn: vi.fn(),
}));

vi.mock("@/runtime/chat-turn/state", () => ({ prepareTurnState }));
vi.mock("@/runtime/chat-turn/post-command", () => ({ runPostCommandTurn }));

import { handleAgentTurn } from "./chat";

function context() {
  return {
    config: { workspaceDir: "." },
    runtime: { roomHandlerQueue: new RoomHandlerQueue() },
    services: {},
  } as never;
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((complete) => {
    resolve = () => complete();
  });
  return { promise, resolve };
}

beforeEach(() => {
  prepareTurnState.mockImplementation(
    (input: { roomId?: string; userId: string }) => {
      const sessionId = input.roomId ?? `room:${input.userId}`;
      return {
        turn: { roomId: stableRuntimeUuid(sessionId), sessionId },
        scheduleProfileObservation: () => undefined,
      };
    },
  );
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("handleAgentTurn room queue", () => {
  it("orders same-room turns and preserves their execution boundary", async () => {
    const first = deferred();
    const started: string[] = [];
    runPostCommandTurn.mockImplementation(
      async (input: { message: string }) => {
        started.push(input.message);
        if (input.message === "first") await first.promise;
        return `reply:${input.message}`;
      },
    );
    const app = context();

    const firstTurn = handleAgentTurn(
      { message: "first", userId: "user", roomId: "shared" },
      app,
    );
    await vi.waitFor(() => expect(started).toEqual(["first"]));
    const secondTurn = handleAgentTurn(
      { message: "second", userId: "user", roomId: "shared" },
      app,
    );

    await Promise.resolve();
    expect(started).toEqual(["first"]);
    first.resolve();
    await expect(Promise.all([firstTurn, secondTurn])).resolves.toEqual([
      "reply:first",
      "reply:second",
    ]);
    expect(started).toEqual(["first", "second"]);
  });

  it("runs separate rooms concurrently", async () => {
    const release = deferred();
    const started: string[] = [];
    runPostCommandTurn.mockImplementation(
      async (input: { message: string }) => {
        started.push(input.message);
        await release.promise;
        return input.message;
      },
    );
    const app = context();

    const left = handleAgentTurn(
      { message: "left", userId: "user", roomId: "left" },
      app,
    );
    const right = handleAgentTurn(
      { message: "right", userId: "user", roomId: "right" },
      app,
    );

    await vi.waitFor(() => expect(started).toHaveLength(2));
    release.resolve();
    await expect(Promise.all([left, right])).resolves.toEqual([
      "left",
      "right",
    ]);
  });

  it("does not enter turn mutation after a queued request is cancelled", async () => {
    const release = deferred();
    const started: string[] = [];
    runPostCommandTurn.mockImplementation(
      async (input: { message: string }) => {
        started.push(input.message);
        if (input.message === "first") await release.promise;
        return input.message;
      },
    );
    const app = context();
    const first = handleAgentTurn(
      { message: "first", userId: "user", roomId: "shared" },
      app,
    );
    await vi.waitFor(() => expect(started).toEqual(["first"]));
    const controller = new AbortController();
    const cancelled = handleAgentTurn(
      { message: "cancelled", userId: "user", roomId: "shared" },
      app,
      { abortSignal: controller.signal },
    );
    controller.abort();
    release.resolve();

    await first;
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(started).toEqual(["first"]);
  });
});
