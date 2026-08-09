import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { SandboxStore } from "./sandbox-store";

const rootDir = join(tmpdir(), `doolittle-e2b-test-${Date.now()}`);

afterEach(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe("local sandbox store", () => {
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

    store.removeSandbox(sandbox.id);

    expect(store.listSandboxes()).toHaveLength(0);
  });

  it("tracks the most recently created sandbox as active", () => {
    const store = new SandboxStore(rootDir);
    const first = store.createSandbox();
    const second = store.createSandbox({ template: "python" });

    expect(store.getActiveSandboxId()).toBe(second.id);
    expect(store.getSandbox(first.id)).toBe(first);
    expect(store.getActiveSandboxId()).toBe(second.id);
  });

  it("leaves active undefined when the active sandbox is removed", () => {
    const store = new SandboxStore(rootDir);
    const first = store.createSandbox();
    const second = store.createSandbox({ template: "python" });

    store.removeSandbox(second.id);

    expect(store.getActiveSandboxId()).toBeUndefined();
    expect(store.listSandboxes().map((sandbox) => sandbox.id)).toEqual([
      first.id,
    ]);
  });

  it("rejects unsupported templates without creating a workspace", () => {
    const store = new SandboxStore(rootDir);

    expect(() => store.createSandbox({ template: "ruby" })).toThrow(
      "Unsupported sandbox template: ruby",
    );
    expect(store.listSandboxes()).toEqual([]);
  });
});
