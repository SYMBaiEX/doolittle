import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CodexModelCallMetric,
  recordEvalCodexModelCall,
} from "./eval-model-metrics";

const previousCapture = process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE;
const previousDataDir = process.env.DOOLITTLE_DATA_DIR;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (previousCapture === undefined) {
    delete process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE;
  } else {
    process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE = previousCapture;
  }
  if (previousDataDir === undefined) {
    delete process.env.DOOLITTLE_DATA_DIR;
  } else {
    process.env.DOOLITTLE_DATA_DIR = previousDataDir;
  }
  while (temporaryDirectories.length > 0) {
    const path = temporaryDirectories.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

function tempDirectory(): string {
  const path = mkdtempSync(join(tmpdir(), "doolittle-eval-model-usage-"));
  temporaryDirectories.push(path);
  return path;
}

describe("eval-only Codex model usage telemetry", () => {
  const metric: CodexModelCallMetric = {
    provider: "codex",
    completed: true,
    providerDurationMs: 123,
    firstTextMs: null,
    inputTokens: 70,
    outputTokens: 12,
    totalTokens: 82,
  };

  it("is inert unless the isolated eval runner enables capture", () => {
    const dataDir = tempDirectory();
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    delete process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE;

    recordEvalCodexModelCall(metric);

    expect(() => statSync(join(dataDir, "eval-model-calls.jsonl"))).toThrow();
  });

  it("writes only numeric provider metrics with owner-only permissions", () => {
    const dataDir = tempDirectory();
    const path = join(dataDir, "eval-model-calls.jsonl");
    process.env.DOOLITTLE_DATA_DIR = dataDir;
    process.env.DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE = "true";

    recordEvalCodexModelCall(metric);

    const stored = readFileSync(path, "utf8");
    expect(JSON.parse(stored)).toEqual(metric);
    expect(stored).not.toContain("prompt");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
