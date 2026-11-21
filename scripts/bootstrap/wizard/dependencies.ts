import { existsSync } from "node:fs";
import { arch, hostname, platform, release } from "node:os";
import { join } from "node:path";
import {
  getLinkedProviderAccountsSnapshot,
  type LinkedProviderAccountsSnapshot,
  localExecutableExists,
} from "@doolittle/agent/runtime/native/account-auth";
import type { BootstrapWizardContext } from "../bootstrap-context";
import { bootstrapColor as color, paint } from "../core/output";
import type { BootstrapDependencyProbe } from "../types";

export function getDependencyProbes(
  root: string,
  existingEnv: Map<string, string>,
  accounts: LinkedProviderAccountsSnapshot = getLinkedProviderAccountsSnapshot(
    undefined,
    ["codex", "claude-code"],
  ),
): BootstrapDependencyProbe[] {
  const browserCommand =
    existingEnv.get("DOOLITTLE_BROWSER_COMMAND") || "lightpanda";
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
      detail: `${platform()} ${release()} · ${arch()} · ${hostname()}`,
      recommendation:
        platform() === "darwin"
          ? "macOS detected. I will favor zsh-friendly paths and local app-style defaults."
          : undefined,
    },
    {
      key: "nub",
      label: "Nub toolkit",
      installed: localExecutableExists("nub"),
      detail:
        "Required for dependency management, TypeScript entrypoints, and repository scripts.",
    },
    {
      key: "git",
      label: "Git",
      installed: localExecutableExists("git"),
      detail: "Used by repository workflows, codegen, and status tooling.",
    },
    {
      key: "docker",
      label: "Docker",
      installed: localExecutableExists("docker"),
      detail: "Container execution backend.",
      recommendation: "Install Docker Desktop or switch execution to Local.",
    },
    {
      key: "podman",
      label: "Podman",
      installed: localExecutableExists("podman"),
      detail: "Rootless container execution backend.",
      recommendation: "Install Podman or choose a different body.",
    },
    {
      key: "ssh",
      label: "SSH",
      installed: localExecutableExists("ssh"),
      detail: "Remote execution backend.",
      recommendation: "Install OpenSSH or stay local.",
    },
    {
      key: "daytona",
      label: "Daytona",
      installed: localExecutableExists("daytona"),
      detail: "Cloud workspace backend.",
      recommendation: "Install Daytona CLI before choosing the Daytona body.",
    },
    {
      key: "modal",
      label: "Modal",
      installed: localExecutableExists("modal"),
      detail: "Elastic cloud backend.",
      recommendation: "Install and authenticate the Modal CLI first.",
    },
    {
      key: "lightpanda",
      label: "Lightpanda vision",
      installed:
        localExecutableExists(browserCommand) ||
        existsSync(join(root, "node_modules", "lightpanda")),
      detail: "Preferred browser automation path.",
      recommendation:
        "Install Lightpanda or choose Basic HTTP eyes during onboarding.",
    },
    {
      key: "ffmpeg",
      label: "FFmpeg",
      installed: localExecutableExists("ffmpeg"),
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
