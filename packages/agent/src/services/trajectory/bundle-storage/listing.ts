import { readdirSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkManifest,
  TrajectoryBundleEntry,
  TrajectoryRecord,
} from "../../../types/trajectory";
import {
  MAX_TRAJECTORY_MANIFEST_BYTES,
  MAX_TRAJECTORY_RECORD_BYTES,
  readOwnedTrajectoryFile,
  resolveOwnedTrajectoryFile,
  TrajectoryInputError,
} from "./safe-read";

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalStringArray(value: unknown): boolean {
  return value === undefined || stringArray(value);
}

function nonnegativeCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function optionalCount(value: unknown): boolean {
  return value === undefined || nonnegativeCount(value);
}

function trajectoryMode(value: unknown): boolean {
  return (
    value === undefined ||
    ["dataset", "research", "evaluation", "rl"].includes(value as string)
  );
}

function bundleFilters(value: unknown): boolean {
  if (value === undefined) return true;
  if (!object(value)) return false;
  return (
    (value.sessionId === undefined ||
      value.sessionId === null ||
      typeof value.sessionId === "string") &&
    (value.role === undefined ||
      value.role === null ||
      ["user", "assistant", "system"].includes(value.role as string))
  );
}

function countMap(value: unknown): boolean {
  return (
    object(value) &&
    Object.entries(value).every(
      ([key, count]) =>
        key !== "__proto__" &&
        key !== "constructor" &&
        key !== "prototype" &&
        nonnegativeCount(count),
    )
  );
}

function hasPoisonKey(value: unknown): boolean {
  const pending: unknown[] = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype")
        return true;
      pending.push(child);
    }
  }
  return false;
}

function parseManifest(baseDir: string, path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(
      readOwnedTrajectoryFile(baseDir, path, MAX_TRAJECTORY_MANIFEST_BYTES),
    );
    if (!object(parsed) || hasPoisonKey(parsed))
      throw new TrajectoryInputError();
    return parsed;
  } catch {
    throw new TrajectoryInputError();
  }
}

export function listTrajectoryBundles(
  baseDir: string,
  limit = 20,
): TrajectoryBundleEntry[] {
  return listTrajectoryManifests(baseDir, "-manifest.json", (path) =>
    describeTrajectoryBundle(baseDir, path),
  ).slice(0, limit);
}

export function describeTrajectoryBundle(
  baseDir: string,
  manifestPath: string,
): TrajectoryBundleEntry {
  const path = resolveOwnedTrajectoryFile(baseDir, manifestPath);
  const value = parseManifest(baseDir, path);
  if (
    typeof value.createdAt !== "string" ||
    typeof value.label !== "string" ||
    typeof value.dataPath !== "string" ||
    !nonnegativeCount(value.limit) ||
    !nonnegativeCount(value.messageCount) ||
    !nonnegativeCount(value.sessionCount) ||
    !stringArray(value.sessions) ||
    !countMap(value.roleCounts) ||
    !optionalString(value.summaryPath) ||
    !optionalString(value.purpose) ||
    !optionalString(value.notes) ||
    !optionalString(value.trainingNotes) ||
    !optionalStringArray(value.tags) ||
    !trajectoryMode(value.mode) ||
    !bundleFilters(value.filters) ||
    !optionalCount(value.recordCount) ||
    !optionalCount(value.messageRecordCount) ||
    !optionalCount(value.eventCount) ||
    (value.recordKindCounts !== undefined &&
      !countMap(value.recordKindCounts)) ||
    (value.trainingCompatible !== undefined &&
      typeof value.trainingCompatible !== "boolean") ||
    (value.trainingFormat !== undefined &&
      !["elizaos-sdk", "doolittle-debug"].includes(
        value.trainingFormat as string,
      ))
  )
    throw new TrajectoryInputError();
  const dataPath = resolveOwnedTrajectoryFile(baseDir, value.dataPath);
  if (typeof value.summaryPath === "string") {
    resolveOwnedTrajectoryFile(baseDir, value.summaryPath);
  }
  return {
    ...value,
    manifestPath: path,
    dataPath,
  } as unknown as TrajectoryBundleEntry;
}

export function listTrajectoryBenchmarkManifests(
  baseDir: string,
  limit = 20,
): TrajectoryBenchmarkManifest[] {
  return listTrajectoryManifests(baseDir, "-benchmark.json", (path) =>
    describeTrajectoryBenchmarkManifest(baseDir, path),
  ).slice(0, limit);
}

export function describeTrajectoryBenchmarkManifest(
  baseDir: string,
  manifestPath: string,
): TrajectoryBenchmarkManifest {
  const path = resolveOwnedTrajectoryFile(baseDir, manifestPath);
  const value = parseManifest(baseDir, path);
  if (
    typeof value.createdAt !== "string" ||
    typeof value.label !== "string" ||
    typeof value.purpose !== "string" ||
    typeof value.group !== "string" ||
    !Array.isArray(value.cases) ||
    !object(value.environment) ||
    !stringArray(value.tags) ||
    !stringArray(value.rubric) ||
    !optionalString(value.summaryPath) ||
    typeof value.environment.provider !== "string" ||
    typeof value.environment.model !== "string" ||
    typeof value.environment.baseUrl !== "string" ||
    typeof value.environment.temperature !== "number" ||
    !Number.isFinite(value.environment.temperature) ||
    !nonnegativeCount(value.environment.maxTokens) ||
    !nonnegativeCount(value.environment.bundleCount) ||
    typeof value.environment.canEvaluate !== "boolean" ||
    typeof value.environment.canPackage !== "boolean" ||
    !optionalString(value.environment.latestBundleLabel) ||
    !optionalString(value.environment.latestBundleCreatedAt)
  )
    throw new TrajectoryInputError();
  const cases = value.cases.map((entry: unknown) => {
    if (
      !object(entry) ||
      typeof entry.manifestPath !== "string" ||
      typeof entry.label !== "string" ||
      !optionalString(entry.purpose) ||
      !optionalString(entry.notes) ||
      !optionalStringArray(entry.tags) ||
      !optionalStringArray(entry.rubric) ||
      !trajectoryMode(entry.mode)
    ) {
      throw new TrajectoryInputError();
    }
    return {
      ...entry,
      manifestPath: describeTrajectoryBundle(baseDir, entry.manifestPath)
        .manifestPath,
    };
  });
  if (typeof value.summaryPath === "string") {
    resolveOwnedTrajectoryFile(baseDir, value.summaryPath);
  }
  return {
    ...value,
    manifestPath: path,
    cases,
  } as unknown as TrajectoryBenchmarkManifest;
}

function listTrajectoryManifests<T extends { createdAt: string }>(
  baseDir: string,
  suffix: string,
  parse: (path: string) => T,
): T[] {
  return readdirSync(baseDir)
    .filter((file) => file.startsWith("trajectory-") && file.endsWith(suffix))
    .map((file) => parse(join(baseDir, file)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readTrajectoryRecords(
  baseDir: string,
  dataPath: string,
): TrajectoryRecord[] {
  const raw = readOwnedTrajectoryFile(
    baseDir,
    dataPath,
    MAX_TRAJECTORY_RECORD_BYTES,
  );
  try {
    return raw
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => {
        const value: unknown = JSON.parse(line);
        if (
          !object(value) ||
          hasPoisonKey(value) ||
          typeof value.sessionId !== "string" ||
          typeof value.createdAt !== "string" ||
          typeof value.role !== "string" ||
          typeof value.text !== "string"
        )
          throw new TrajectoryInputError();
        return value as unknown as TrajectoryRecord;
      });
  } catch {
    throw new TrajectoryInputError();
  }
}
