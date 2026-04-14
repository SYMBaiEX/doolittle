import type {
  TrajectoryRecord,
  TrajectoryRlReadyOptions,
} from "../../../types/trajectory";
import {
  buildRlPaths,
  emptyRlReadyManifest,
  writeRlDatasetFiles,
} from "./assembly";
import { buildRlTurns } from "./turn-builder";
import type { RlTurnRecord } from "./types";

export function exportTrajectoryRlReady(input: {
  baseDir: string;
  sessionId: string;
  messages: TrajectoryRecord[];
  slug(value: string): string;
  options?: TrajectoryRlReadyOptions;
}): { dataPath: string; manifestPath: string; turnCount: number } {
  const options = input.options ?? {};
  const stamp = Date.now();
  const label = input.slug(options.label ?? input.sessionId);
  const { dataPath, manifestPath } = buildRlPaths({
    baseDir: input.baseDir,
    stamp,
    label,
    prefix: "rl",
  });

  if (!input.messages.length) {
    emptyRlReadyManifest({
      sessionId: input.sessionId,
      dataPath,
      manifestPath,
    });
    return { dataPath, manifestPath, turnCount: 0 };
  }

  const windowSize = options.windowSize ?? 20;
  const turns: RlTurnRecord[] = buildRlTurns(input.sessionId, input.messages, {
    model: options.model,
    provider: options.provider,
    agentName: options.agentName,
    windowSize,
    includeMetadata: options.includeMetadata,
  });

  writeRlDatasetFiles({
    turns,
    dataPath,
    manifestPath,
    manifest: {
      sessionId: input.sessionId,
      label,
      model: options.model ?? "unknown",
      provider: options.provider ?? "unknown",
      agentName: options.agentName ?? "doolittle",
      turnCount: turns.length,
      windowSize,
      dataPath,
      messageCount: input.messages.length,
    },
  });

  return {
    dataPath,
    manifestPath,
    turnCount: turns.length,
  };
}
