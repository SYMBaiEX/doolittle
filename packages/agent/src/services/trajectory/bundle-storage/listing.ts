import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  TrajectoryBenchmarkManifest,
  TrajectoryBundleEntry,
  TrajectoryRecord,
} from "../../../types/trajectory";

type TimestampedManifest = { createdAt: string };
type BundleManifestParser<T extends TimestampedManifest> = (
  manifestPath: string,
) => T;

export function listTrajectoryBundles(
  baseDir: string,
  limit = 20,
): TrajectoryBundleEntry[] {
  return listTrajectoryManifests(
    baseDir,
    "-manifest.json",
    (manifestPath) => parseJsonFile(manifestPath) as TrajectoryBundleEntry,
  ).slice(0, limit);
}

export function describeTrajectoryBundle(
  manifestPath: string,
): TrajectoryBundleEntry {
  return parseJsonFile(manifestPath) as TrajectoryBundleEntry;
}

export function listTrajectoryBenchmarkManifests(
  baseDir: string,
  limit = 20,
): TrajectoryBenchmarkManifest[] {
  return listTrajectoryManifests(baseDir, "-benchmark.json", (manifestPath) => {
    return {
      ...(parseJsonFile(manifestPath) as TrajectoryBenchmarkManifest),
      manifestPath,
    };
  }).slice(0, limit);
}

export function describeTrajectoryBenchmarkManifest(
  manifestPath: string,
): TrajectoryBenchmarkManifest {
  return {
    ...(parseJsonFile(manifestPath) as TrajectoryBenchmarkManifest),
    manifestPath,
  };
}

function listTrajectoryManifests<T extends TimestampedManifest>(
  baseDir: string,
  suffix: string,
  parseManifest: BundleManifestParser<T>,
): T[] {
  return readdirSync(baseDir)
    .filter((file) => file.endsWith(suffix))
    .map((file) => join(baseDir, file))
    .map(parseManifest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function readTrajectoryRecords(dataPath: string): TrajectoryRecord[] {
  const raw = readFileSync(dataPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return raw.map((line) => JSON.parse(line) as TrajectoryRecord);
}

function parseJsonFile(manifestPath: string): TimestampedManifest {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as TimestampedManifest;
}
