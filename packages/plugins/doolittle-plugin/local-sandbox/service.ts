import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_LOCAL_SANDBOX_SERVICE } from "@doolittle/contracts";
import { SandboxManager } from "@elizaos/agent/services/sandbox-manager";
import {
  runShell,
  type ShellResult,
} from "@elizaos/agent/services/shell-execution-router";
import { Service as ElizaService, type IAgentRuntime } from "@elizaos/core";

import { collectProcessEnv, resolveExecutionCommand } from "./runtime";
import { SandboxStore } from "./sandbox-store";
import type { E2BExecutionResult, E2BSandboxOptions } from "./types";

export class LocalSandboxService extends ElizaService {
  static serviceType = DOOLITTLE_LOCAL_SANDBOX_SERVICE;

  capabilityDescription =
    "Doolittle local sandbox service with E2B-compatible methods for local code execution and autocoder workflows.";

  private readonly sandboxStore = new SandboxStore(
    join(tmpdir(), "doolittle-e2b"),
  );
  private readonly sandboxManager = new SandboxManager({
    mode: "standard",
    containerPrefix: "doolittle-e2b",
    readOnlyRoot: true,
    workspaceRoot: this.sandboxStore.rootDir,
  });

  static async start(runtime?: IAgentRuntime): Promise<LocalSandboxService> {
    const service = new LocalSandboxService(runtime);
    await service.sandboxManager.start();
    return service;
  }

  async stop(): Promise<void> {
    await this.sandboxManager.stop();
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
    const workdir = this.sandboxManager.getContainerWorkspacePath(sandbox.path);
    if (!workdir) {
      return this.executionError(
        language,
        sandbox.id,
        `Sandbox workspace is outside the managed workspace: ${sandbox.path}`,
      );
    }

    let result: ShellResult;
    try {
      result = await runShell(
        {
          command,
          args,
          cwd: workdir,
          env: {
            ...collectProcessEnv(),
            NODE_ENV: process.env.NODE_ENV ?? "development",
            XDG_CACHE_HOME: `${workdir}/.cache`,
          },
          toolName: "doolittle.local-sandbox.execute-code",
        },
        {
          mode: "local-safe",
          sandboxManager: this.sandboxManager,
        },
      );
    } catch (error) {
      return this.executionError(
        language,
        sandbox.id,
        error instanceof Error ? error.message : String(error),
      );
    }

    const { exitCode, stdout, stderr } = result;
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

  private executionError(
    language: string,
    sandboxId: string,
    value: string,
  ): E2BExecutionResult {
    return {
      success: false,
      text: value,
      stdout: "",
      stderr: value,
      error: { value, traceback: value },
      language,
      sandboxId,
    };
  }
}
