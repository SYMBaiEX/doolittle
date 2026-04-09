import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type {
  TrajectoryRecord,
  TrajectoryRlDatasetOptions,
  TrajectoryRlReadyOptions,
} from "../../types/trajectory";

export type {
  TrajectoryRlDatasetOptions,
  TrajectoryRlReadyOptions,
} from "../../types/trajectory";

interface RlTurnMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface RlTurnRecord {
  id: string;
  sessionId: string;
  model: string;
  provider: string;
  agentName: string;
  createdAt: string;
  messages: RlTurnMessage[];
  response: string;
  metadata?:
    | {
        turnIndex: number;
        windowSize: number;
        sessionMessageCount: number;
      }
    | undefined;
}

function buildRlTurns(
  sessionId: string,
  messages: TrajectoryRecord[],
  options: {
    model?: string;
    provider?: string;
    agentName?: string;
    windowSize: number;
    includeMetadata?: boolean;
  },
): RlTurnRecord[] {
  const turns: RlTurnRecord[] = [];

  for (let i = 1; i < messages.length; i++) {
    const window = messages.slice(Math.max(0, i - options.windowSize), i);
    const response = messages[i];
    if (!response || response.role !== "assistant") {
      continue;
    }

    turns.push({
      id: `${sessionId}:${i}`,
      sessionId,
      model: options.model ?? "unknown",
      provider: options.provider ?? "unknown",
      agentName: options.agentName ?? "doolittle",
      createdAt: response.createdAt,
      messages: window.map((message) => ({
        role: message.role,
        content: message.text,
      })),
      response: response.text,
      metadata: options.includeMetadata
        ? {
            turnIndex: i,
            windowSize: window.length,
            sessionMessageCount: messages.length,
          }
        : undefined,
    });
  }

  return turns;
}

export function exportTrajectoryRlReady(input: {
  baseDir: string;
  sessionId: string;
  messages: TrajectoryRecord[];
  slug: (value: string) => string;
  options?: TrajectoryRlReadyOptions;
}): { dataPath: string; manifestPath: string; turnCount: number } {
  const options = input.options ?? {};
  const stamp = Date.now();
  const label = input.slug(options.label ?? input.sessionId);
  const dataPath = join(input.baseDir, `rl-${stamp}-${label}.jsonl`);
  const manifestPath = join(
    input.baseDir,
    `rl-${stamp}-${label}-manifest.json`,
  );

  if (!input.messages.length) {
    writeFileSync(dataPath, "", "utf8");
    writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          sessionId: input.sessionId,
          turnCount: 0,
          dataPath,
        },
        null,
        2,
      ),
      "utf8",
    );
    return { dataPath, manifestPath, turnCount: 0 };
  }

  const windowSize = options.windowSize ?? 20;
  const turns = buildRlTurns(input.sessionId, input.messages, {
    model: options.model,
    provider: options.provider,
    agentName: options.agentName,
    windowSize,
    includeMetadata: options.includeMetadata,
  });

  writeFileSync(
    dataPath,
    turns.map((turn) => JSON.stringify(turn)).join("\n"),
    "utf8",
  );

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schema: "doolittle-rl-v1",
        createdAt: new Date().toISOString(),
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
      null,
      2,
    ),
    "utf8",
  );

  return { dataPath, manifestPath, turnCount: turns.length };
}

export function exportTrajectoryRlDataset(input: {
  baseDir: string;
  messages: TrajectoryRecord[];
  slug: (value: string) => string;
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
  const dataPath = join(input.baseDir, `rl-dataset-${stamp}-${label}.jsonl`);
  const manifestPath = join(
    input.baseDir,
    `rl-dataset-${stamp}-${label}-manifest.json`,
  );

  writeFileSync(
    dataPath,
    turns.map((turn) => JSON.stringify(turn)).join("\n"),
    "utf8",
  );

  writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        schema: "doolittle-rl-v1",
        createdAt: new Date().toISOString(),
        label,
        model: options.model ?? "unknown",
        provider: options.provider ?? "unknown",
        agentName: options.agentName ?? "doolittle",
        turnCount: turns.length,
        sessionCount: bySession.size,
        windowSize,
        dataPath,
        totalMessages: input.messages.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    dataPath,
    manifestPath,
    turnCount: turns.length,
    sessionCount: bySession.size,
  };
}

export function describeTrajectoryRlExport(totalSessions: number): string {
  return [
    "RL Export Capabilities:",
    `  Sessions available: ${totalSessions}`,
    "  Formats: JSONL (windowed turn format, Doolittle training schema)",
    "  Schema: doolittle-rl-v1",
    "  Methods:",
    "    exportRlReady(sessionId)  — single session RL export",
    "    exportRlDataset()         — all sessions combined RL export",
  ].join("\n");
}
