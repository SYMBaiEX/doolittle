import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

interface SandboxOptions {
  template?: string;
  metadata?: Record<string, string>;
}

interface SandboxRecord {
  id: string;
  path: string;
  template: string;
  metadata: Record<string, string>;
  createdAt: string;
}

interface ExecutionResult {
  success: boolean;
  text: string;
  stdout: string;
  stderr: string;
  error?: {
    value: string;
    traceback?: string;
  };
  language: string;
  sandboxId?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class E2BService extends ElizaService {
  static serviceType = "e2b";

  capabilityDescription =
    "Workspace-native E2B-style sandbox service for local code execution and autocoder workflows.";

  private readonly rootDir = join(tmpdir(), "eliza-agent-e2b");
  private readonly sandboxes = new Map<string, SandboxRecord>();
  private activeSandboxId?: string;

  constructor(runtime?: IAgentRuntime) {
    super(runtime);
    mkdirSync(this.rootDir, { recursive: true });
  }

  static async start(runtime?: IAgentRuntime): Promise<E2BService> {
    return new E2BService(runtime);
  }

  async stop(): Promise<void> {
    for (const sandbox of this.sandboxes.values()) {
      rmSync(sandbox.path, { recursive: true, force: true });
    }
    this.sandboxes.clear();
    this.activeSandboxId = undefined;
  }

  async createSandbox(options: SandboxOptions = {}): Promise<string> {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `sandbox-${Date.now()}`;
    const path = join(this.rootDir, id);
    mkdirSync(path, { recursive: true });
    this.sandboxes.set(id, {
      id,
      path,
      template: options.template ?? "node-js",
      metadata: options.metadata ?? {},
      createdAt: nowIso(),
    });
    this.activeSandboxId = id;
    return id;
  }

  async killSandbox(id?: string): Promise<void> {
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

  async executeCode(
    code: string,
    language = "python",
  ): Promise<ExecutionResult> {
    const sandbox = this.getOrCreateActiveSandbox();
    const [command, args] = this.resolveCommand(language, code);
    const child = Bun.spawn([command, ...args], {
      cwd: sandbox.path,
      env: {
        ...processEnv(),
        NODE_ENV: process.env.NODE_ENV ?? "development",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const text = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");

    if (exitCode !== 0) {
      return {
        success: false,
        text,
        stdout,
        stderr,
        error: {
          value: stderr.trim() || stdout.trim() || `Process exited ${exitCode}`,
          traceback: stderr.trim() || undefined,
        },
        language,
        sandboxId: sandbox.id,
      };
    }

    return {
      success: true,
      text,
      stdout,
      stderr,
      language,
      sandboxId: sandbox.id,
    };
  }

  listSandboxes() {
    return [...this.sandboxes.values()];
  }

  private getOrCreateActiveSandbox(): SandboxRecord {
    if (this.activeSandboxId) {
      const active = this.sandboxes.get(this.activeSandboxId);
      if (active) {
        return active;
      }
    }
    const id = `sandbox-${Date.now()}`;
    const path = join(this.rootDir, id);
    mkdirSync(path, { recursive: true });
    const sandbox = {
      id,
      path,
      template: "node-js",
      metadata: {},
      createdAt: nowIso(),
    };
    this.sandboxes.set(id, sandbox);
    this.activeSandboxId = id;
    return sandbox;
  }

  private resolveCommand(language: string, code: string): [string, string[]] {
    switch (language) {
      case "python":
        return ["python3", ["-c", code]];
      case "javascript":
        return ["node", ["-e", code]];
      case "typescript":
        return ["bun", ["-e", code]];
      case "bash":
      case "sh":
        return ["bash", ["-lc", code]];
      default:
        return ["python3", ["-c", code]];
    }
  }
}

function processEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

export const e2bPlugin: Plugin = {
  name: "@elizaos/plugin-e2b",
  description:
    "Workspace-native E2B sandbox plugin for local autocoder-compatible execution.",
  services: [E2BService],
  providers: [],
  actions: [],
};

export default e2bPlugin;
