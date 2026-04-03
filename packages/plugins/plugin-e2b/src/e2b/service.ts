import { tmpdir } from "node:os";
import { join } from "node:path";

import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";

import { collectProcessEnv, resolveExecutionCommand } from "./runtime";
import { SandboxStore } from "./sandbox-store";
import type { E2BExecutionResult, E2BSandboxOptions } from "./types";

export class E2BService extends ElizaService {
  static serviceType = "e2b";

  capabilityDescription =
    "Workspace-native E2B-style sandbox service for local code execution and autocoder workflows.";

  private readonly sandboxStore = new SandboxStore(
    join(tmpdir(), "doolittle-e2b"),
  );

  static async start(runtime?: IAgentRuntime): Promise<E2BService> {
    return new E2BService(runtime);
  }

  async stop(): Promise<void> {
    this.sandboxStore.clear();
  }

  async createSandbox(options: E2BSandboxOptions = {}): Promise<string> {
    return this.sandboxStore.createSandbox(options).id;
  }

  async killSandbox(id?: string): Promise<void> {
    this.sandboxStore.killSandbox(id);
  }

  async executeCode(
    code: string,
    language = "python",
  ): Promise<E2BExecutionResult> {
    const sandbox = this.sandboxStore.getOrCreateActiveSandbox();
    const [command, args] = resolveExecutionCommand(language, code);
    const child = Bun.spawn([command, ...args], {
      cwd: sandbox.path,
      env: {
        ...collectProcessEnv(),
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
    return this.sandboxStore.listSandboxes();
  }
}
