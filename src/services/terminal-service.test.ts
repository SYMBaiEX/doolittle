import { describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TerminalService } from "./terminal-service";
import type { RuntimeSettings } from "./settings-service";

function makeSettings(): RuntimeSettings {
  return {
    model: {
      provider: "offline",
      model: "local",
      baseUrl: "http://localhost",
      temperature: 0.2,
      maxTokens: 400,
    },
    gateway: {
      sessionTimeoutMinutes: 120,
      mirrorResponsesToHistory: true,
    },
    execution: {
      backend: "local",
      dockerImage: "oven/bun:latest",
      dockerNetwork: "host",
      dockerWorkspacePath: "/workspace",
      dockerEnvPassthrough: ["PATH", "HOME"],
      singularityImage: "",
      daytonaTarget: "",
      daytonaCommand: "",
      daytonaShell: "/bin/sh",
      daytonaWorkspacePath: "/workspace",
      daytonaSnapshot: "",
      daytonaBootstrapCommand: "",
      daytonaStatusCommand: "",
      daytonaInspectCommand: "",
      modalTarget: "",
      modalCommand: "",
      modalShell: "/bin/bash",
      modalWorkspacePath: "/workspace",
      modalEnvironment: "",
      modalBootstrapCommand: "",
      modalStatusCommand: "",
      modalInspectCommand: "",
      commandTimeoutMs: 30_000,
      healthTimeoutMs: 5_000,
      containerCpuLimit: "2",
      containerMemoryLimit: "2g",
      containerPidsLimit: 256,
      containerReadOnlyRoot: true,
      sshHost: "",
      sshUser: "",
      sshPath: "",
      sshPort: 22,
      sshKeyPath: "",
      sshStrictHostKeyChecking: false,
    },
    mcp: {
      serverCommand: "",
      timeoutMs: 5_000,
    },
  };
}

function writeExecutable(filePath: string, content: string): void {
  writeFileSync(filePath, content, "utf8");
  chmodSync(filePath, 0o755);
}

describe("TerminalService", () => {
  it("runs local commands and records them", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-test-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const result = await service.run("printf 'terminal-ok'");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("terminal-ok");
      const record = service.recent(1)[0];
      expect(record?.command).toBe("printf 'terminal-ok'");
      expect(record?.backendMode).toBe("local");
      expect(record?.timedOut).toBe(false);
      expect(record?.durationMs).toBeGreaterThanOrEqual(0);
      expect(record?.preview?.checks.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports command timeouts cleanly", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-timeout-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const result = await service.run("sleep 1", 25);
      expect(result.exitCode).toBe(124);
      expect(result.timedOut).toBe(true);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.stderr).toContain("timed out");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("previews docker execution with hardened flags", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-preview-"));
    const settings = makeSettings();
    settings.execution.backend = "docker";
    const service = new TerminalService(join(root, "data"), root, () => settings);

    try {
      const preview = service.preview("printf 'preview-ok'");
      expect(preview.command).toBe("printf 'preview-ok'");
      expect(preview.argv[0]).toBe("docker");
      expect(preview.argv).toContain("--security-opt");
      expect(preview.argv).toContain("no-new-privileges");
      expect(preview.argv).toContain("--cap-drop");
      expect(preview.argv).toContain("ALL");
      expect(preview.argv).toContain("/bin/sh");
      expect(preview.argv.at(-1)).toBe("printf 'preview-ok'");
      expect(preview.bootstrap.length).toBeGreaterThan(0);
      expect(preview.checks.some((check) => check.id === "docker.preview.generated")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("previews ssh execution with explicit key and remote shell hardening", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-ssh-preview-"));
    const keyPath = join(root, "id_ed25519");
    writeExecutable(keyPath, "dummy-key");
    const settings = makeSettings();
    settings.execution.backend = "ssh";
    settings.execution.sshHost = "example.internal";
    settings.execution.sshUser = "agent";
    settings.execution.sshPath = "/srv/eliza";
    settings.execution.sshPort = 2222;
    settings.execution.sshKeyPath = keyPath;
    settings.execution.sshStrictHostKeyChecking = true;
    const service = new TerminalService(join(root, "data"), root, () => settings);

    try {
      const preview = service.preview("git status --short");
      expect(preview.argv[0]).toBe("ssh");
      expect(preview.argv).toContain("-i");
      expect(preview.argv).toContain(keyPath);
      expect(preview.argv).toContain("IdentitiesOnly=yes");
      expect(preview.argv).toContain("PreferredAuthentications=publickey");
      expect(preview.argv.at(-1)).toContain("exec sh -lc");
      expect(preview.checks.some((check) => check.id === "ssh.preview.generated")).toBe(true);
      expect(preview.bootstrap.length).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports local backend health", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-health-"));
    const service = new TerminalService(join(root, "data"), root, makeSettings);

    try {
      const health = await service.health();
      const local = health.find((entry) => entry.backend === "local");
      expect(local?.ready).toBe(true);
      expect(local?.limits.commandTimeoutMs).toBe(30_000);
      expect(local?.limits.containerReadOnlyRoot).toBe(true);
      expect(local?.bootstrap.length).toBeGreaterThan(0);
      expect(local?.diagnostics.length).toBeGreaterThan(0);
      expect(local?.checks.length).toBeGreaterThan(0);
      expect(health.some((entry) => entry.backend === "podman")).toBe(true);
      expect(health.some((entry) => entry.backend === "singularity")).toBe(true);
      expect(health.some((entry) => entry.backend === "daytona")).toBe(true);
      expect(health.some((entry) => entry.backend === "modal")).toBe(true);
      expect(health.find((entry) => entry.backend === "docker")?.mode).toBe("container");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("surfaces container and ssh health through structured checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-health-backends-"));
    const fakeBin = join(root, "bin");
    const fakeData = join(root, "data");
    mkdirSync(fakeBin, { recursive: true });

    writeExecutable(
      join(fakeBin, "docker"),
      [
        "#!/bin/sh",
        "set -eu",
        'case "${1:-}" in',
        "  version)",
        "    printf '24.0.0\\n'",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );

    writeExecutable(
      join(fakeBin, "podman"),
      [
        "#!/bin/sh",
        "set -eu",
        'case "${1:-}" in',
        "  --version)",
        "    printf 'Podman 5.0.0\\n'",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );

    writeExecutable(
      join(fakeBin, "ssh"),
      [
        "#!/bin/sh",
        "set -eu",
        'if [ "${1:-}" = "-o" ] || [ "${1:-}" = "-p" ] || [ "${1:-}" = "-i" ]; then',
        "  exit 0",
        "fi",
        'if [ "${1:-}" = "root@example.internal" ] || [ "${2:-}" = "root@example.internal" ] || [ "${3:-}" = "root@example.internal" ]; then',
        "  exit 0",
        "fi",
        "exit 0",
        "",
      ].join("\n"),
    );

    const originalPath = process.env.PATH ?? "";
    process.env.PATH = `${fakeBin}:${originalPath}`;
    const settings = makeSettings();
    settings.execution.backend = "docker";
    settings.execution.sshHost = "example.internal";
    settings.execution.sshUser = "root";
    settings.execution.sshPath = "/srv/eliza";
    settings.execution.sshKeyPath = join(root, "id_ed25519");
    writeExecutable(settings.execution.sshKeyPath, "dummy-key");
    const service = new TerminalService(fakeData, root, () => settings);

    try {
      const health = await service.health();
      const docker = health.find((entry) => entry.backend === "docker");
      const podman = health.find((entry) => entry.backend === "podman");
      const ssh = health.find((entry) => entry.backend === "ssh");
      expect(docker?.checks.length).toBeGreaterThan(0);
      expect(docker?.checks.some((check) => check.id === "docker.runtime.binary")).toBe(true);
      expect(docker?.checks.some((check) => check.id === "docker.runtime.image")).toBe(true);
      expect(podman?.checks.length).toBeGreaterThan(0);
      expect(podman?.checks.some((check) => check.id === "podman.runtime.binary")).toBe(true);
      expect(podman?.checks.some((check) => check.id === "podman.runtime.image")).toBe(true);
      expect(ssh?.checks.length).toBeGreaterThan(0);
      expect(ssh?.checks.some((check) => check.id === "ssh.config.key")).toBe(true);
      expect(ssh?.bootstrap.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = originalPath;
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("previews daytona and modal execution with explicit targets", () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-cloud-preview-"));
    const settings = makeSettings();
    settings.execution.backend = "daytona";
    settings.execution.daytonaTarget = "sandbox-dev";
    settings.execution.daytonaCommand = "daytona";
    settings.execution.daytonaShell = "/bin/bash";
    settings.execution.daytonaSnapshot = "snapshot-dev";
    settings.execution.daytonaBootstrapCommand = "test -d .eliza-agent || mkdir -p .eliza-agent";
    settings.execution.daytonaStatusCommand = "daytona info sandbox-dev --format json";
    const daytonaService = new TerminalService(join(root, "daytona-data"), root, () => settings);

    try {
      const daytonaPreview = daytonaService.preview("git status --short");
      expect(daytonaPreview.argv[0]).toBe("daytona");
      expect(daytonaPreview.argv).toContain("sandbox-dev");
      expect(daytonaPreview.argv).toContain("--timeout");
      expect(daytonaPreview.argv).toContain("/bin/bash");
      expect(daytonaPreview.engine).toBe("daytona");
      expect(daytonaPreview.cloud?.provider).toBe("daytona");
      expect(daytonaPreview.cloud?.workspacePath).toBe("/workspace");
      expect(daytonaPreview.cloud?.snapshot).toBe("snapshot-dev");
      expect(daytonaPreview.cloud?.bootstrapCommand).toContain("mkdir -p .eliza-agent");
      expect(daytonaPreview.cloud?.statusCommand).toContain("daytona info sandbox-dev");
      expect(daytonaPreview.cloud?.inspectCommand).toContain("daytona info sandbox-dev");
      expect(daytonaPreview.cloudSession?.provider).toBe("daytona");
      expect(daytonaPreview.cloudSession?.target).toBe("sandbox-dev");
      const daytonaState = JSON.parse(
        readFileSync(join(root, "daytona-data", "cloud-sessions.json"), "utf8"),
      ) as { sessions?: Array<{ provider?: string; target?: string; state?: string }> };
      expect(daytonaState.sessions?.some((session) => session.provider === "daytona")).toBe(true);

      settings.execution.backend = "modal";
      settings.execution.modalTarget = "sandbox-prod";
      settings.execution.modalCommand = "modal";
      settings.execution.modalShell = "/bin/zsh";
      settings.execution.modalEnvironment = "sandbox-prod-env";
      settings.execution.modalBootstrapCommand = "test -d .eliza-agent || mkdir -p .eliza-agent";
      settings.execution.modalStatusCommand = "modal shell sandbox-prod --cmd pwd";
      const modalService = new TerminalService(join(root, "modal-data"), root, () => settings);
      const modalPreview = modalService.preview("pwd");
      expect(modalPreview.argv[0]).toBe("modal");
      expect(modalPreview.argv).toContain("shell");
      expect(modalPreview.argv).toContain("sandbox-prod");
      expect(modalPreview.argv).toContain("-e");
      expect(modalPreview.argv).toContain("sandbox-prod-env");
      expect(modalPreview.argv).toContain("--cmd");
      expect(modalPreview.argv.at(-1)).toContain("/bin/zsh -lc");
      expect(modalPreview.engine).toBe("modal");
      expect(modalPreview.cloud?.provider).toBe("modal");
      expect(modalPreview.cloud?.workspacePath).toBe("/workspace");
      expect(modalPreview.cloud?.environment).toBe("sandbox-prod-env");
      expect(modalPreview.cloud?.bootstrapCommand).toContain("mkdir -p .eliza-agent");
      expect(modalPreview.cloud?.inspectCommand).toContain("modal shell sandbox-prod");
      expect(modalPreview.cloudSession?.provider).toBe("modal");
      expect(modalPreview.cloudSession?.target).toBe("sandbox-prod");
      const modalState = JSON.parse(
        readFileSync(join(root, "modal-data", "cloud-sessions.json"), "utf8"),
      ) as { sessions?: Array<{ provider?: string; target?: string; state?: string }> };
      expect(modalState.sessions?.some((session) => session.provider === "modal")).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("probes daytona and modal cloud backends with sandbox-aware checks", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-terminal-cloud-health-"));
    const fakeBin = join(root, "bin");
    const fakeData = join(root, "data");
    mkdirSync(fakeBin, { recursive: true });

    writeExecutable(
      join(fakeBin, "daytona"),
      [
        "#!/bin/sh",
        "set -eu",
        'case "${1:-}" in',
        "  info)",
        "    printf '{\"name\":\"sandbox-dev\",\"status\":\"ready\"}\\n'",
        "    ;;",
        "  exec)",
        "    shift 3",
        '    if [ "${1:-}" = "--cwd" ]; then',
        "      shift 2",
        "    fi",
        '    if [ "${1:-}" = "--timeout" ]; then',
        "      shift 2",
        "    fi",
        '    if [ "${1:-}" = "--" ]; then',
        "      shift",
        "      shift",
        "      shift",
        "    fi",
        '    if [ "${1:-}" = "-lc" ]; then',
        "      shift",
        "      shift",
        "    fi",
        '    case "$*" in',
        "      *eliza-daytona-ok*)",
        "        printf 'eliza-daytona-ok\\n'",
        "        ;;",
        "      *)",
        "        printf 'daytona exec ok\\n'",
        "        ;;",
        "    esac",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );

    writeExecutable(
      join(fakeBin, "modal"),
      [
        "#!/bin/sh",
        "set -eu",
        'case "${1:-}" in',
        "  shell)",
        "    shift",
        "    if [ \"${1:-}\" = \"sandbox-prod\" ]; then",
        "      shift",
        "    fi",
        '    if [ "${1:-}" = "-e" ]; then',
        "      shift 2",
        "    fi",
        '    if [ "${1:-}" = "--cmd" ]; then',
        "      shift 2",
        "    fi",
        '    case "$*" in',
        "      *eliza-modal-ok*)",
        "        printf 'eliza-modal-ok\\n'",
        "        ;;",
        "      *)",
        "        printf 'modal shell ok\\n'",
        "        ;;",
        "    esac",
        "    ;;",
        "  *)",
        "    exit 0",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
    );

    const originalPath = process.env.PATH ?? "";
    process.env.PATH = `${fakeBin}:${originalPath}`;
    const settings = makeSettings();
    settings.execution.backend = "daytona";
    settings.execution.daytonaTarget = "sandbox-dev";
    settings.execution.daytonaCommand = "daytona";
    settings.execution.daytonaShell = "/bin/bash";
    settings.execution.daytonaSnapshot = "snapshot-dev";
    settings.execution.daytonaBootstrapCommand = "mkdir -p .eliza-agent";
    settings.execution.daytonaStatusCommand = "daytona info sandbox-dev --format json";
    settings.execution.modalTarget = "sandbox-prod";
    settings.execution.modalCommand = "modal";
    settings.execution.modalShell = "/bin/zsh";
    settings.execution.modalEnvironment = "sandbox-prod-env";
    settings.execution.modalBootstrapCommand = "mkdir -p .eliza-agent";
    settings.execution.modalStatusCommand = "modal shell sandbox-prod --cmd pwd";
    const service = new TerminalService(fakeData, root, () => settings);

    try {
      const health = await service.health();
      const daytona = health.find((entry) => entry.backend === "daytona");
      const modal = health.find((entry) => entry.backend === "modal");
      expect(daytona).toBeDefined();
      expect(daytona?.cloud?.provider).toBe("daytona");
      expect(daytona?.cloud?.snapshot).toBe("snapshot-dev");
      expect(daytona?.cloudSession?.provider).toBe("daytona");
      expect(daytona?.cloudSession?.sessionId).toBeTruthy();
      expect(daytona?.checks.some((check) => check.id === "daytona.config.status")).toBe(true);
      expect(daytona?.checks.some((check) => check.id === "daytona.config.inspect")).toBe(true);
      expect(daytona?.checks.some((check) => check.id === "daytona.runtime.binary")).toBe(true);
      expect(daytona?.checks.some((check) => check.id === "daytona.runtime.probe")).toBe(true);
      expect(daytona?.bootstrap.length).toBeGreaterThan(0);
      expect(modal).toBeDefined();
      expect(modal?.cloud?.provider).toBe("modal");
      expect(modal?.cloud?.environment).toBe("sandbox-prod-env");
      expect(modal?.cloudSession?.provider).toBe("modal");
      expect(modal?.cloudSession?.sessionId).toBeTruthy();
      expect(modal?.checks.some((check) => check.id === "modal.config.status")).toBe(true);
      expect(modal?.checks.some((check) => check.id === "modal.config.inspect")).toBe(true);
      expect(modal?.checks.some((check) => check.id === "modal.runtime.binary")).toBe(true);
      expect(modal?.checks.some((check) => check.id === "modal.runtime.probe")).toBe(true);
      expect(modal?.bootstrap.length).toBeGreaterThan(0);
    } finally {
      process.env.PATH = originalPath;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
