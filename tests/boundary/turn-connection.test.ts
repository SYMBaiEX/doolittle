import { expect, it, vi } from "vitest";
import type { AgentExecutionContext } from "../../packages/agent/src/runtime/chat";
import { ensureTurnConnection } from "../../packages/agent/src/runtime/chat-turn/connection";
import { stableRuntimeUuid } from "../../packages/agent/src/runtime/stable-runtime-uuid";

function fixture() {
  const runtime = {
    agentId: stableRuntimeUuid("connection-fixture-agent"),
    ensureConnection: vi.fn(
      async (_input: Parameters<typeof ensureTurnConnection>[1]) => {},
    ),
    ensureParticipantInRoom: vi.fn(async () => {}),
  };
  const context = { runtime } as unknown as AgentExecutionContext;
  const worldId = stableRuntimeUuid("connection-fixture-world");
  const input = (room: string) => ({
    entityId: stableRuntimeUuid("connection-fixture-user"),
    roomId: stableRuntimeUuid(room),
    worldId,
    source: "desktop",
    channelId: room,
  });
  return { runtime, context, input };
}

it("joins concurrent initialization for the same connection and room participant", async () => {
  const { runtime, context, input } = fixture();
  let release = () => {};
  const connection = new Promise<void>((resolve) => {
    release = resolve;
  });
  runtime.ensureConnection.mockReturnValue(connection);
  const firstTurns = Array.from({ length: 8 }, () =>
    ensureTurnConnection(context, input("same-room")),
  );
  try {
    await vi.waitFor(() =>
      expect(runtime.ensureConnection).toHaveBeenCalledTimes(1),
    );
    expect(runtime.ensureParticipantInRoom).not.toHaveBeenCalled();
  } finally {
    release();
  }
  await Promise.all(firstTurns);
  await ensureTurnConnection(context, input("same-room"));
  expect(runtime.ensureConnection).toHaveBeenCalledTimes(1);
  expect(runtime.ensureParticipantInRoom).toHaveBeenCalledTimes(1);
});

it("initializes distinct rooms concurrently and retains both successful identities", async () => {
  const { runtime, context, input } = fixture();
  let release = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  runtime.ensureConnection.mockReturnValue(waiting);
  const otherRoom = input("another-room");
  const mainRoom = input("main-room");
  const both = Promise.all([
    ensureTurnConnection(context, otherRoom),
    ensureTurnConnection(context, mainRoom),
  ]);
  try {
    await vi.waitFor(() =>
      expect(runtime.ensureConnection).toHaveBeenCalledTimes(2),
    );
  } finally {
    release();
  }
  await both;
  await Promise.all([
    ensureTurnConnection(context, otherRoom),
    ensureTurnConnection(context, mainRoom),
  ]);
  expect(runtime.ensureConnection).toHaveBeenCalledTimes(2);
  expect(runtime.ensureParticipantInRoom).toHaveBeenCalledTimes(2);
});

it("retries failed connection or participant initialization independently", async () => {
  const { runtime, context, input } = fixture();
  const room = input("retry-room");
  const failure = new Error("connection unavailable");
  runtime.ensureConnection.mockRejectedValueOnce(failure);
  runtime.ensureParticipantInRoom.mockRejectedValueOnce(
    new Error("participant unavailable"),
  );

  const attempts = await Promise.allSettled([
    ensureTurnConnection(context, room),
    ensureTurnConnection(context, room),
  ]);
  expect(attempts).toEqual([
    { status: "rejected", reason: failure },
    { status: "rejected", reason: failure },
  ]);
  expect(runtime.ensureConnection).toHaveBeenCalledTimes(1);
  expect(runtime.ensureParticipantInRoom).not.toHaveBeenCalled();

  await expect(ensureTurnConnection(context, room)).rejects.toThrow(
    "participant unavailable",
  );
  await expect(ensureTurnConnection(context, room)).resolves.toBeUndefined();
  expect(runtime.ensureConnection).toHaveBeenCalledTimes(2);
  expect(runtime.ensureParticipantInRoom).toHaveBeenCalledTimes(2);
});

it("evicts older successes and keeps runtime identities separate", async () => {
  const first = fixture();
  const second = fixture();
  for (let index = 0; index < 1_025; index++) {
    await ensureTurnConnection(first.context, first.input(`room-${index}`));
  }
  await ensureTurnConnection(first.context, first.input("room-1024"));
  expect(first.runtime.ensureConnection).toHaveBeenCalledTimes(1_025);
  await ensureTurnConnection(first.context, first.input("room-0"));
  expect(first.runtime.ensureConnection).toHaveBeenCalledTimes(1_026);
  expect(first.runtime.ensureParticipantInRoom).toHaveBeenCalledTimes(1_026);

  await ensureTurnConnection(second.context, first.input("room-1024"));
  expect(second.runtime.ensureConnection).toHaveBeenCalledTimes(1);
  expect(second.runtime.ensureParticipantInRoom).toHaveBeenCalledTimes(1);
});
