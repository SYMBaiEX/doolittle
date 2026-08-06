import { describe, expect, it } from "vitest";
import { buildEnvConfig, resolveAcpServerCommand } from "./build";
import type { ManagedDirectories } from "./directories";
import { parseEnv } from "./schema";

const directories: ManagedDirectories = {
  dataDir: "/tmp/data",
  skillsDir: "/tmp/skills",
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

  it("allows port zero for an operating-system-assigned API port", () => {
    const values = parseEnv({ DOOLITTLE_PORT: "0" });
    const config = buildEnvConfig(values, directories);

    expect(config.port).toBe(0);
  });

  it("prefers Eliza's canonical API bind over the legacy product alias", () => {
    const values = parseEnv({
      ELIZA_API_BIND: "0.0.0.0",
      ELIZA_API_PORT: "4312",
      DOOLITTLE_HOST: "127.0.0.1",
      DOOLITTLE_PORT: "3000",
    });

    expect(buildEnvConfig(values, directories)).toMatchObject({
      host: "0.0.0.0",
      port: 4312,
    });
  });

  it("uses a signed-in Claude CLI by default while preserving an explicit opt-out", () => {
    expect(
      buildEnvConfig(parseEnv({}), directories).claudeCodeCliFallback,
    ).toBe(true);
    expect(
      buildEnvConfig(
        parseEnv({ DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK: "false" }),
        directories,
      ).claudeCodeCliFallback,
    ).toBe(false);
  });

  it("migrates the retired HTTP ACP launcher without touching custom commands", () => {
    expect(resolveAcpServerCommand("doolittle api")).toBe("doolittle acp");
    expect(resolveAcpServerCommand("custom-acp --stdio")).toBe(
      "custom-acp --stdio",
    );
    expect(resolveAcpServerCommand(undefined)).toBeUndefined();
  });
});
