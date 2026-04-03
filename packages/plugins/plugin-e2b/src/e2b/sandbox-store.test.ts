import { afterEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { SandboxStore } from "./sandbox-store";

const rootDir = join(tmpdir(), `doolittle-e2b-test-${Date.now()}`);

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("plugin-e2b sandbox store", () => {
  it("creates, lists, and removes sandboxes", () => {
    mkdirSync(rootDir, { recursive: true });
    const store = new SandboxStore(rootDir);

    const sandbox = store.createSandbox({
      template: "node-js",
      metadata: { source: "test" },
    });

    expect(store.listSandboxes()).toHaveLength(1);
    expect(sandbox.template).toBe("node-js");
    expect(sandbox.metadata.source).toBe("test");

    store.killSandbox(sandbox.id);

    expect(store.listSandboxes()).toHaveLength(0);
  });

  it("reuses the active sandbox when one already exists", () => {
    mkdirSync(rootDir, { recursive: true });
    const store = new SandboxStore(rootDir);

    const created = store.createSandbox();
    const active = store.getOrCreateActiveSandbox();

    expect(active.id).toBe(created.id);
    expect(active.path).toBe(created.path);
  });
});
