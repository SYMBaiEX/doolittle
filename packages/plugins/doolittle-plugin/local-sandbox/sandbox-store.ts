import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import type {
  E2BSandboxOptions,
  E2BSandboxRecord,
  SupportedSandboxTemplate,
} from "./types";
import { SandboxNotFoundError, UnsupportedSandboxTemplateError } from "./types";

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

  constructor(readonly rootDir: string) {
    mkdirSync(this.rootDir, { recursive: true });
  }

  createSandbox(options: E2BSandboxOptions = {}): E2BSandboxRecord {
    const template = this.resolveTemplate(options.template);
    const id = createSandboxId();
    const record = {
      id,
      path: join(this.rootDir, id),
      template,
      metadata: options.metadata ?? {},
      createdAt: nowIso(),
    };
    mkdirSync(record.path, { recursive: true });
    this.sandboxes.set(id, record);
    this.activeSandboxId = id;
    return record;
  }

  removeSandbox(id?: string): E2BSandboxRecord | undefined {
    const sandboxId = id ?? this.activeSandboxId;
    if (!sandboxId) {
      return undefined;
    }
    const sandbox = this.sandboxes.get(sandboxId);
    if (!sandbox) {
      if (id) {
        throw new SandboxNotFoundError(id);
      }
      return undefined;
    }
    rmSync(sandbox.path, { recursive: true, force: true });
    this.sandboxes.delete(sandboxId);
    if (this.activeSandboxId === sandboxId) {
      this.activeSandboxId = undefined;
    }
    return sandbox;
  }

  listSandboxes(): E2BSandboxRecord[] {
    return [...this.sandboxes.values()];
  }

  getActiveSandboxId(): string | undefined {
    return this.activeSandboxId;
  }

  deactivateSandbox(id: string): void {
    if (this.activeSandboxId === id) {
      this.activeSandboxId = undefined;
    }
  }

  getSandbox(id: string): E2BSandboxRecord {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox) {
      throw new SandboxNotFoundError(id);
    }
    return sandbox;
  }

  cleanupRoot(): void {
    rmSync(this.rootDir, { recursive: true, force: true });
    mkdirSync(this.rootDir, { recursive: true });
    this.sandboxes.clear();
    this.activeSandboxId = undefined;
  }

  private resolveTemplate(template?: string): SupportedSandboxTemplate {
    if (template === undefined || template === "node-js") {
      return "node-js";
    }
    if (template === "python") {
      return "python";
    }
    throw new UnsupportedSandboxTemplateError(template);
  }
}
