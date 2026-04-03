import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { E2BSandboxOptions, E2BSandboxRecord } from "./types";

function nowIso(): string {
  return new Date().toISOString();
}

function createSandboxId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `sandbox-${Date.now()}`;
}

export class SandboxStore {
  private readonly sandboxes = new Map<string, E2BSandboxRecord>();
  private activeSandboxId?: string;

  constructor(private readonly rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true });
  }

  createSandbox(options: E2BSandboxOptions = {}): E2BSandboxRecord {
    const id = createSandboxId();
    const record = {
      id,
      path: join(this.rootDir, id),
      template: options.template ?? "node-js",
      metadata: options.metadata ?? {},
      createdAt: nowIso(),
    };
    mkdirSync(record.path, { recursive: true });
    this.sandboxes.set(id, record);
    this.activeSandboxId = id;
    return record;
  }

  killSandbox(id?: string): void {
    const sandboxId = id ?? this.activeSandboxId;
    if (!sandboxId) {
      return;
    }
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      return;
    }
    rmSync(sandbox.path, { recursive: true, force: true });
    this.sandboxes.delete(sandboxId);
    if (this.activeSandboxId === sandboxId) {
      this.activeSandboxId = undefined;
    }
  }

  clear(): void {
    for (const sandbox of this.sandboxes.values()) {
      rmSync(sandbox.path, { recursive: true, force: true });
    }
    this.sandboxes.clear();
    this.activeSandboxId = undefined;
  }

  listSandboxes(): E2BSandboxRecord[] {
    return [...this.sandboxes.values()];
  }

  getOrCreateActiveSandbox(): E2BSandboxRecord {
    if (this.activeSandboxId) {
      const active = this.sandboxes.get(this.activeSandboxId);
      if (active) {
        return active;
      }
    }
    return this.createSandbox();
  }
}
