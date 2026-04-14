import type {
  TrajectoryRecord,
  TrajectoryRlDatasetOptions,
} from "../../../types/trajectory";
import { buildRlPaths, writeRlDatasetFiles } from "./assembly";
import { buildRlTurns } from "./turn-builder";
import type { RlTurnRecord } from "./types";

export function exportTrajectoryRlDataset(input: {
  baseDir: string;
  messages: TrajectoryRecord[];
  slug(value: string): string;
  options?: TrajectoryRlDatasetOptions;
}): {
  dataPath: string;
  manifestPath: string;
  turnCount: number;
  sessionCount: number;
} {
  const options = input.options ?? {};
  const bySession = new Map<string, TrajectoryRecord[]>();

  for (const message of input.messages) {
    const group = bySession.get(message.sessionId) ?? [];
    group.push(message);
    bySession.set(message.sessionId, group);
  }

  const windowSize = options.windowSize ?? 20;
  const turns: RlTurnRecord[] = [];

  for (const [sessionId, messages] of bySession) {
    messages.sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    );
    turns.push(
      ...buildRlTurns(sessionId, messages, {
        model: options.model,
        provider: options.provider,
        agentName: options.agentName,
        windowSize,
      }),
    );
  }

  const stamp = Date.now();
  const label = input.slug(options.label ?? "rl-dataset");
  const { dataPath, manifestPath } = buildRlPaths({
    baseDir: input.baseDir,
    stamp,
    label,
    prefix: "rl-dataset",
  });

  writeRlDatasetFiles({
    turns,
    dataPath,
    manifestPath,
    manifest: {
      label,
      model: options.model ?? "unknown",
      provider: options.provider ?? "unknown",
      agentName: options.agentName ?? "doolittle",
      turnCount: turns.length,
      windowSize,
      dataPath,
      sessionCount: bySession.size,
      totalMessages: input.messages.length,
    },
  });

  return {
    dataPath,
    manifestPath,
    turnCount: turns.length,
    sessionCount: bySession.size,
  };
}
