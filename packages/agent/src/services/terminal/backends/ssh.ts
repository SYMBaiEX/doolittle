import { existsSync } from "node:fs";
import type {
  ExecutionBackendHealth,
  ExecutionBackendPreview,
} from "@/types/execution";
import type { RuntimeSettings } from "../../settings/runtime-settings";
import type { ExecutionBackend } from "../contracts/backend";
import {
  buildBootstrapHints,
  buildHealthLimits,
  renderChecks,
} from "../execution/diagnostics";
import {
  commandExists,
  normalizeBackendError,
  runCommand,
  shellQuote,
  type TerminalRunResult,
} from "../execution/subprocess";
import {
  buildSshBaseArgs,
  buildSshChecks,
  buildSshPreviewChecks,
} from "../planning";

class SshExecutionBackend implements ExecutionBackend {
  readonly name = "ssh" as const;

  preview(
    command: string,
    options: { cwd: string; timeoutMs: number; settings: RuntimeSettings },
  ): ExecutionBackendPreview {
    const execution = options.settings.execution;
    const checks = buildSshPreviewChecks(options.settings);
    return {
      backend: this.name,
      mode: "remote",
      engine: "ssh",
      ready: false,
      detail: "SSH execution runs the command on a remote host and workspace.",
      cwd: options.cwd,
      timeoutMs: options.timeoutMs,
      command,
      argv: [
        "ssh",
        ...buildSshBaseArgs(options.settings),
        `${execution.sshUser || "?"}@${execution.sshHost || "?"}`,
        `cd ${shellQuote(execution.sshPath || "UNKNOWN")} && exec sh -lc ${shellQuote(command)}`,
      ],
      diagnostics: renderChecks(checks),
      checks,
      bootstrap: buildBootstrapHints(checks, [
        `Ensure SSH access to ${execution.sshHost || "the remote host"} is working.`,
        `Ensure the remote workspace ${execution.sshPath || "UNKNOWN"} exists.`,
      ]),
    };
  }

  async health(settings: RuntimeSettings): Promise<ExecutionBackendHealth> {
    const probeTimeoutMs = settings.execution.healthTimeoutMs ?? 5_000;
    const runtimeAvailable = await commandExists("ssh", probeTimeoutMs);
    const execution = settings.execution;
    const baseChecks = buildSshChecks(settings, runtimeAvailable, false);
    if (!runtimeAvailable) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail: "SSH command not available.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, [
          "Install the ssh client and verify key/host access.",
        ]),
      };
    }

    if (!execution.sshHost || !execution.sshUser || !execution.sshPath) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail:
          "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, [
          "Set ssh host, user, and remote path in runtime settings.",
        ]),
      };
    }

    if (execution.sshKeyPath && !existsSync(execution.sshKeyPath)) {
      return {
        backend: this.name,
        mode: "remote",
        engine: "ssh",
        ready: false,
        detail: `SSH key path does not exist: ${execution.sshKeyPath}.`,
        limits: buildHealthLimits(settings),
        diagnostics: renderChecks(baseChecks),
        checks: baseChecks,
        bootstrap: buildBootstrapHints(baseChecks, [
          `Create or correct the SSH key path: ${execution.sshKeyPath}.`,
        ]),
      };
    }

    const probe = await runCommand(
      [
        "ssh",
        ...buildSshBaseArgs(settings),
        `${execution.sshUser}@${execution.sshHost}`,
        "test",
        "-d",
        execution.sshPath,
      ],
      { timeoutMs: settings.execution.healthTimeoutMs ?? 5_000 },
    ).catch(() => ({
      exitCode: 1,
      stdout: "",
      stderr: "SSH command unavailable or remote host unreachable.",
      timedOut: false,
      durationMs: 0,
    }));
    const ready = probe.exitCode === 0;
    const finalChecks = buildSshChecks(settings, runtimeAvailable, ready);

    return {
      backend: this.name,
      mode: "remote",
      engine: "ssh",
      ready,
      detail: ready
        ? `SSH backend ready for ${execution.sshUser}@${execution.sshHost}:${execution.sshPort} (${execution.sshPath}).`
        : probe.stderr ||
          `SSH backend could not reach ${execution.sshUser}@${execution.sshHost}:${execution.sshPort}.`,
      limits: buildHealthLimits(settings),
      diagnostics: renderChecks(finalChecks),
      checks: finalChecks,
      bootstrap: buildBootstrapHints(finalChecks, [
        `Verify remote path ${execution.sshPath} exists and is writable if needed.`,
        execution.sshStrictHostKeyChecking
          ? "Host key checking is enabled."
          : "Host key checking is disabled for this session.",
      ]),
    };
  }

  async run(
    command: string,
    options: {
      timeoutMs: number;
      settings: RuntimeSettings;
      abortSignal?: AbortSignal;
    },
  ): Promise<TerminalRunResult> {
    const execution = options.settings.execution;
    if (!execution.sshHost || !execution.sshUser || !execution.sshPath) {
      return {
        exitCode: 1,
        stdout: "",
        stderr:
          "SSH backend requires execution.sshHost, execution.sshUser, and execution.sshPath.",
        timedOut: false,
        durationMs: 0,
      };
    }

    const remoteCommand = `cd ${shellQuote(execution.sshPath)} && exec sh -lc ${shellQuote(command)}`;
    return normalizeBackendError(
      await runCommand(
        [
          "ssh",
          ...buildSshBaseArgs(options.settings),
          `${execution.sshUser}@${execution.sshHost}`,
          remoteCommand,
        ],
        { timeoutMs: options.timeoutMs, abortSignal: options.abortSignal },
      ),
    );
  }
}

export function createSshExecutionBackend(): ExecutionBackend {
  return new SshExecutionBackend();
}
