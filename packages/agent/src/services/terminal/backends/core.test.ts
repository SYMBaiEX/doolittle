import { describe, expect, it } from "bun:test";
import { LOCAL_SHELL } from "../execution/subprocess";
import { buildSingularityCommand } from "../planning";
import { createCoreExecutionBackends } from "./core";
import { makeSettings } from "./testing";

describe("core execution backends", () => {
  it("creates the built-in execution backends", () => {
    const backends = createCoreExecutionBackends();

    expect(backends.size).toBe(5);
    expect(backends.has("local")).toBe(true);
    expect(backends.has("docker")).toBe(true);
    expect(backends.has("podman")).toBe(true);
    expect(backends.has("ssh")).toBe(true);
    expect(backends.has("singularity")).toBe(true);
  });

  it("preserves local preview behavior through the extracted helper", () => {
    const backends = createCoreExecutionBackends();
    const local = backends.get("local");
    if (!local) {
      throw new Error("local backend is missing from helper map");
    }

    const preview = local.preview("printf ok", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings(),
    });

    expect(preview.backend).toBe("local");
    expect(preview.mode).toBe("local");
    expect(preview.ready).toBe(true);
    expect(preview.argv).toEqual([LOCAL_SHELL, "-lc", "printf ok"]);
  });

  it("returns the existing ssh configuration error unchanged", async () => {
    const backends = createCoreExecutionBackends();
    const ssh = backends.get("ssh");
    if (!ssh) {
      throw new Error("ssh backend is missing from helper map");
    }

    const result = await ssh.run("pwd", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
    );
  });

  it("returns the existing singularity configuration error unchanged", async () => {
    const backends = createCoreExecutionBackends();
    const singularity = backends.get("singularity");
    if (!singularity) {
      throw new Error("singularity backend is missing from helper map");
    }

    const result = await singularity.run("pwd", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings(),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe(
      "Singularity backend requires execution.singularityImage.",
    );
  });

  it("preserves singularity preview behavior through the extracted helper", () => {
    const backends = createCoreExecutionBackends();
    const singularity = backends.get("singularity");
    if (!singularity) {
      throw new Error("singularity backend is missing from helper map");
    }

    const settings = makeSettings();
    settings.execution.singularityImage = "library://doolittle/test.sif";

    const preview = singularity.preview("pwd", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings,
    });

    expect(preview.backend).toBe("singularity");
    expect(preview.mode).toBe("container");
    expect(preview.engine).toBe("singularity");
    expect(preview.ready).toBe(false);
    expect(preview.argv).toEqual(
      buildSingularityCommand("pwd", process.cwd(), settings),
    );
  });
});
