import { writeFileSync } from "node:fs";
import { join } from "node:path";

import type { RlTurnRecord } from "./types";

type RlExportManifestBase = {
  label: string;
  model: string;
  provider: string;
  agentName: string;
  turnCount: number;
  windowSize: number;
  dataPath: string;
};

const RL_SCHEMA = "doolittle-rl-v1";

export function buildRlPaths(input: {
  baseDir: string;
  stamp: number;
  label: string;
  prefix: "rl" | "rl-dataset";
}): { dataPath: string; manifestPath: string } {
  const dataPath = join(
    input.baseDir,
    `${input.prefix}-${input.stamp}-${input.label}.jsonl`,
  );
  const manifestPath = join(
    input.baseDir,
    `${input.prefix}-${input.stamp}-${input.label}-manifest.json`,
  );
  return { dataPath, manifestPath };
}

export function writeRlDatasetFiles(input: {
  turns: RlTurnRecord[];
  manifest: RlExportManifestBase & {
    sessionId?: string;
    sessionCount?: number;
    messageCount?: number;
    totalMessages?: number;
  };
  dataPath: string;
  manifestPath: string;
}): { dataPath: string; manifestPath: string } {
  writeFileSync(
    input.dataPath,
    input.turns.map((turn) => JSON.stringify(turn)).join("\n"),
    "utf8",
  );
  writeFileSync(
    input.manifestPath,
    JSON.stringify(
      {
        ...input.manifest,
        schema: RL_SCHEMA,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return {
    dataPath: input.dataPath,
    manifestPath: input.manifestPath,
  };
}

export function emptyRlReadyManifest(input: {
  sessionId: string;
  dataPath: string;
  manifestPath: string;
}): { dataPath: string; manifestPath: string } {
  writeFileSync(input.dataPath, "", "utf8");
  writeFileSync(
    input.manifestPath,
    JSON.stringify(
      {
        sessionId: input.sessionId,
        turnCount: 0,
        dataPath: input.dataPath,
      },
      null,
      2,
    ),
    "utf8",
  );
  return { dataPath: input.dataPath, manifestPath: input.manifestPath };
}
