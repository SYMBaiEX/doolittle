import { describe, expect, it } from "bun:test";
import { buildEnvConfig } from "./build";
import type { ManagedDirectories } from "./directories";
import { parseEnv } from "./schema";

const directories: ManagedDirectories = {
  dataDir: "/tmp/data",
  skillsDir: "/tmp/skills",
  cronOutputDir: "/tmp/cron",
  gatewayDataDir: "/tmp/gateway",
  hooksDir: "/tmp/hooks",
  workspaceDir: "/tmp/workspace",
};

describe("env config builder", () => {
  it("uses the run-depth preset when max iterations is unset or blank", () => {
    const values = parseEnv({
      DOOLITTLE_RUN_DEPTH: "deep",
      DOOLITTLE_REMOTE_SYNC_INCLUDE: "src, docs , ",
      DOOLITTLE_REMOTE_SYNC_EXCLUDE: "dist, coverage",
      DOOLITTLE_REMOTE_ARTIFACT_PATHS: "one,two",
      DOOLITTLE_DOCKER_ENV_PASSTHROUGH: "PATH, HOME",
    });

    const config = buildEnvConfig(values, directories, {
      DOOLITTLE_MAX_ITERATIONS: "",
    });

    expect(config.maxIterations).toBe(90);
    expect(config.remoteSyncInclude).toEqual(["src", "docs"]);
    expect(config.remoteSyncExclude).toEqual(["dist", "coverage"]);
    expect(config.remoteArtifactPaths).toEqual(["one", "two"]);
    expect(config.dockerEnvPassthrough).toEqual(["PATH", "HOME"]);
  });

  it("keeps an explicit max iteration override", () => {
    const values = parseEnv({
      DOOLITTLE_RUN_DEPTH: "quick",
      DOOLITTLE_MAX_ITERATIONS: "12",
    });

    const config = buildEnvConfig(values, directories, {
      DOOLITTLE_MAX_ITERATIONS: "12",
    });

    expect(config.runDepth).toBe("quick");
    expect(config.maxIterations).toBe(12);
  });
});
