import { expect, it } from "vitest";
import { stableRuntimeUuid } from "../../packages/agent/src/runtime/stable-runtime-uuid";
import { RunControllerService } from "../../packages/agent/src/services/run-controller-service";

it("keeps queued desktop run admission attached to its native Eliza room", () => {
  const controller = new RunControllerService();
  for (const suffix of ["first", "second"]) {
    const sessionId = `desktop:${suffix}`;
    const runId = `run-${suffix}`;
    expect(
      controller.claimTaskRun({
        sessionId,
        runId,
        roomId: sessionId,
        responseId: `response-${suffix}`,
        source: "desktop",
      }).accepted,
    ).toBe(true);
    controller.acceptQueuedRun({
      sessionId,
      runId,
      roomId: sessionId,
      source: "desktop",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });
    const nativeRoom = stableRuntimeUuid(sessionId);
    controller.startTurn({
      sessionId,
      runId,
      roomId: nativeRoom,
      source: "desktop",
      message: "Repair this project",
      runDepth: "standard",
      configuredMaxIterations: 45,
      progressMode: "verbose",
    });
    expect(controller.getByRoomId(nativeRoom)?.runId).toBe(runId);
    expect(controller.getByRoomId(sessionId)).toBeUndefined();
    controller.noteRuntimeMessage(nativeRoom);
    expect(controller.getByRoomId(nativeRoom)?.sessionId).toBe(sessionId);
  }
  expect(
    controller.getByRoomId(stableRuntimeUuid("desktop:first"))?.runId,
  ).toBe("run-first");
});
