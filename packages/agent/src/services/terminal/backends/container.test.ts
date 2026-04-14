import { describe, expect, it } from "bun:test";
import { createContainerExecutionBackends } from "./container";
import { makeSettings } from "./testing";

describe("container execution backends", () => {
  it("creates docker and podman execution backends with existing preview behavior", () => {
    const byName = new Map(
      createContainerExecutionBackends().map((backend) => [
        backend.name,
        backend,
      ]),
    );

    const docker = byName.get("docker");
    const podman = byName.get("podman");
    if (!docker || !podman) {
      throw new Error("expected docker and podman backends");
    }

    const dockerPreview = docker.preview("printf ok", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings({ backend: "docker", dockerEnvPassthrough: [] }),
    });
    const podmanPreview = podman.preview("printf ok", {
      cwd: process.cwd(),
      timeoutMs: 5_000,
      settings: makeSettings({ backend: "docker", dockerEnvPassthrough: [] }),
    });

    expect(dockerPreview.engine).toBe("docker");
    expect(dockerPreview.argv[0]).toBe("docker");
    expect(podmanPreview.engine).toBe("podman");
    expect(podmanPreview.argv[0]).toBe("podman");
  });
});
