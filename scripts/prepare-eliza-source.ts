#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  readElizaSourceBuilds,
  sourceBuildMatches,
  sourceTreeDigest,
  sourceWorkspaceDirectory,
} from "./eliza-source-policy";

const root = resolve(import.meta.dirname, "..");
const builds = readElizaSourceBuilds(root);
const parent = join(root, "vendor/elizaos/packages");
mkdirSync(parent, { recursive: true });
for (const [name, build] of Object.entries(builds)) {
  const target = join(root, sourceWorkspaceDirectory(name));
  if (existsSync(target) && sourceTreeDigest(target) === build.treeSha256)
    continue;
  const stage = mkdtempSync(join(parent, ".prepare-"));
  try {
    const extracted = spawnSync(
      "tar",
      ["-xzf", join(root, build.artifact), "--strip-components=1", "-C", stage],
      { stdio: "inherit" },
    );
    if (extracted.error) throw extracted.error;
    if (extracted.status !== 0)
      throw new Error(`Cannot extract qualified SDK package ${name}`);
    const manifest = JSON.parse(
      readFileSync(join(stage, "package.json"), "utf8"),
    );
    if (
      manifest.name !== name ||
      !sourceBuildMatches(build, manifest) ||
      sourceTreeDigest(stage) !== build.treeSha256
    )
      throw new Error(
        `Extracted SDK package differs from its qualified build: ${name}`,
      );
    rmSync(target, { recursive: true, force: true });
    renameSync(stage, target);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}
console.log(
  `Prepared ${Object.keys(builds).length} unmodified upstream SDK packages.`,
);
if (process.argv.includes("--install")) {
  const args = process.argv
    .slice(2)
    .filter((value) => value !== "--install" && value !== "--");
  const result = spawnSync("nub", ["install", ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
