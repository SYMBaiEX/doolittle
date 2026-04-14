import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { arch, hostname, platform, release } from "node:os";
import { join } from "node:path";
import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { bootstrapColor as color, paint } from "../core/output";
import type { BootstrapDependencyProbe } from "../types";

export interface DependencyProbeEnvironment {
  spawnSync: typeof spawnSync;
  existsSync: typeof existsSync;
  platform: typeof platform;
  arch: typeof arch;
  release: typeof release;
  hostname: typeof hostname;
  getLinkedProviderAccountsSnapshot: typeof getLinkedProviderAccountsSnapshot;
}

const defaultDependencyProbeEnvironment: DependencyProbeEnvironment = {
  spawnSync,
  existsSync,
  platform,
  arch,
  release,
  hostname,
  getLinkedProviderAccountsSnapshot,
};

function commandExists(
  command: string,
  environment: DependencyProbeEnvironment,
): boolean {
  const result = environment.spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  });
  return result.status === 0;
}

function hasPackage(
  root: string,
  path: string,
  environment: DependencyProbeEnvironment,
): boolean {
  return environment.existsSync(join(root, "node_modules", ...path.split("/")));
}

export function getDependencyProbes(
  root: string,
  existingEnv: Map<string, string>,
  environment: DependencyProbeEnvironment = defaultDependencyProbeEnvironment,
): BootstrapDependencyProbe[] {
  const browserCommand =
    existingEnv.get("DOOLITTLE_BROWSER_COMMAND") || "lightpanda";
  const accounts = environment.getLinkedProviderAccountsSnapshot();
  const codexNativeReady =
    accounts.codex.nativeReady === true || accounts.codex.reusable === true;
  const claudeNativeReady =
    accounts.claudeCode.nativeReady === true ||
    accounts.claudeCode.reusable === true;
  return [
    {
      key: "host",
      label: "Host system",
      installed: true,
      detail: `${environment.platform()} ${environment.release()} · ${environment.arch()} · ${environment.hostname()}`,
      recommendation:
        environment.platform() === "darwin"
          ? "macOS detected. I will favor zsh-friendly paths and local app-style defaults."
          : undefined,
    },
    {
      key: "bun",
      label: "Bun runtime",
      installed: commandExists("bun", environment),
      detail: "Required for install, build, and runtime entrypoints.",
    },
    {
      key: "git",
      label: "Git",
      installed: commandExists("git", environment),
      detail: "Used by repository workflows, codegen, and status tooling.",
    },
    {
      key: "docker",
      label: "Docker",
      installed: commandExists("docker", environment),
      detail: "Container execution backend.",
      recommendation: "Install Docker Desktop or switch execution to Local.",
    },
    {
      key: "podman",
      label: "Podman",
      installed: commandExists("podman", environment),
      detail: "Rootless container execution backend.",
      recommendation: "Install Podman or choose a different body.",
    },
    {
      key: "ssh",
      label: "SSH",
      installed: commandExists("ssh", environment),
      detail: "Remote execution backend.",
      recommendation: "Install OpenSSH or stay local.",
    },
    {
      key: "daytona",
      label: "Daytona",
      installed: commandExists("daytona", environment),
      detail: "Cloud workspace backend.",
      recommendation: "Install Daytona CLI before choosing the Daytona body.",
    },
    {
      key: "modal",
      label: "Modal",
      installed: commandExists("modal", environment),
      detail: "Elastic cloud backend.",
      recommendation: "Install and authenticate the Modal CLI first.",
    },
    {
      key: "lightpanda",
      label: "Lightpanda vision",
      installed:
        commandExists(browserCommand, environment) ||
        hasPackage(root, "lightpanda", environment),
      detail: "Preferred browser automation path.",
      recommendation:
        "Install Lightpanda or choose Basic HTTP eyes during onboarding.",
    },
    {
      key: "ffmpeg",
      label: "FFmpeg",
      installed: commandExists("ffmpeg", environment),
      detail: "Helpful for richer media/audio workflows.",
      recommendation:
        "Install FFmpeg if you want stronger local media processing.",
    },
    {
      key: "codex-auth",
      label: "Codex account",
      installed: codexNativeReady,
      detail: accounts.codex.detail,
      recommendation: codexNativeReady
        ? undefined
        : `Run ${accounts.codex.loginCommand ?? "codex login"} if you want account-linked Codex workflows.`,
    },
    {
      key: "claude-auth",
      label: "Claude Code account",
      installed: claudeNativeReady,
      detail: accounts.claudeCode.detail,
      recommendation: claudeNativeReady
        ? undefined
        : accounts.claudeCode.fallbackReady
          ? `Run ${accounts.claudeCode.setupCommand ?? "claude setup-token"} if you want the full native Claude Code path.`
          : `Run ${accounts.claudeCode.loginCommand ?? "claude auth login"} if you want account-linked Anthropic workflows.`,
    },
  ];
}

export function printDependencyProbes(
  context: BootstrapWizardContext,
  probes: BootstrapDependencyProbe[],
): void {
  context.section("Preflight", "I checked the machine before waking fully.");
  for (const probe of probes) {
    const state = probe.installed
      ? paint("online", color.green)
      : paint("missing", color.red);
    if (context.getWizardScreen()) {
      context
        .getWizardScreen()
        ?.appendLine(
          `${probe.label}: ${probe.installed ? "online" : "missing"}`,
        );
    } else {
      console.log(`  ${probe.label}: ${state}`);
    }
    context.info(probe.detail);
    if (!probe.installed && probe.recommendation) {
      context.warn(probe.recommendation);
    }
  }
}
