import { setTrajectoryPurpose } from "@elizaos/core";
import type { AgentExecutionContext } from "@/runtime/chat";
import type { TurnState } from "../state";
import {
  readSdkTrajectoryStepId,
  runWithSdkTrajectoryContext,
} from "../trajectory";

export async function runShortcutModelWithSdkTrajectory<T>(input: {
  context: AgentExecutionContext;
  turn: TurnState;
  source: string | undefined;
  path: string;
  purpose: string;
  metadata?: Record<string, unknown>;
  run: () => Promise<T> | T;
}): Promise<{ result: T; trajectoryStepId?: string }> {
  const metadataTarget: { metadata?: unknown } = {
    metadata: {
      path: input.path,
      ...(input.metadata ?? {}),
    },
  };
  const result = await runWithSdkTrajectoryContext(
    input.context,
    {
      runId: input.turn.runId,
      roomId: String(input.turn.roomId),
      messageId: `${input.turn.runId}:${input.path}`,
      source: input.source ?? input.turn.connectionSource,
      purpose: input.purpose,
      metadata: {
        path: input.path,
        runId: input.turn.runId,
        roomId: String(input.turn.roomId),
        sessionId: input.turn.sessionId,
        source: input.source ?? input.turn.connectionSource,
        ...(input.metadata ?? {}),
      },
      metadataTarget,
    },
    async () => {
      setTrajectoryPurpose(input.purpose);
      return await input.run();
    },
  );

  return {
    result,
    trajectoryStepId: readSdkTrajectoryStepId(metadataTarget.metadata),
  };
}
