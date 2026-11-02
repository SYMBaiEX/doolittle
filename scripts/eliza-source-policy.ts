import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type SourceBuild = {
  artifact: string;
  version: string;
  sha256: string;
  repository: string;
  commit: string;
  package: string;
  bun: string;
  node: string;
  nub: string;
  toolLockSha256: string;
};

/** Only reviewed, integrity-checked archives may replace a registry SDK pin. */
export function readElizaSourceBuilds(
  root: string,
): Record<string, SourceBuild> {
  const config = JSON.parse(
    readFileSync(join(root, "tooling/eliza-source/source.json"), "utf8"),
  ) as {
    repository: string;
    commit: string;
    bun: string;
    node: string;
    nub: string;
    aliases?: Record<string, string>;
    packages: string[];
  };
  const builds = JSON.parse(
    readFileSync(join(root, "vendor/elizaos/source-builds.json"), "utf8"),
  ) as Record<string, SourceBuild>;
  const toolLock = createHash("sha256")
    .update(readFileSync(join(root, "tooling/eliza-source/nub.lock")))
    .digest("hex");
  for (const [name, build] of Object.entries(builds)) {
    if (
      (!name.startsWith("@elizaos/") &&
        !Object.values(config.aliases ?? {}).includes(name)) ||
      !/^vendor\/elizaos\/[a-z\d.-]+\.tgz$/u.test(build.artifact) ||
      !/^[a-f\d]{64}$/u.test(build.sha256) ||
      build.commit !== config.commit ||
      !/^[a-f\d]{40}$/u.test(build.commit) ||
      build.repository !== config.repository ||
      build.bun !== config.bun ||
      build.node !== config.node ||
      build.nub !== config.nub ||
      build.toolLockSha256 !== toolLock ||
      !config.packages.includes(build.package)
    )
      throw new Error(`Unqualified ElizaOS source build: ${name}`);
    const actual = createHash("sha256")
      .update(readFileSync(resolve(root, build.artifact)))
      .digest("hex");
    if (actual !== build.sha256)
      throw new Error(`ElizaOS source archive integrity mismatch: ${name}`);
  }
  if (Object.keys(builds).length !== config.packages.length)
    throw new Error("ElizaOS source package closure is incomplete");
  return builds;
}

export function sourceBuildMatches(
  build: SourceBuild,
  installed: { version?: string; doolittleSourceBuild?: Partial<SourceBuild> },
): boolean {
  const receipt = installed.doolittleSourceBuild;
  return (
    installed.version === build.version &&
    receipt !== undefined &&
    [
      "repository",
      "commit",
      "package",
      "bun",
      "node",
      "nub",
      "toolLockSha256",
    ].every(
      (key) =>
        receipt[key as keyof SourceBuild] === build[key as keyof SourceBuild],
    )
  );
}
