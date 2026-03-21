import type { EnvConfig } from "@/types";
import { getNativePluginCatalog } from "./plugin-catalog";

interface NativePackageAuditRecord {
  packageName: string;
  role: string;
  currentStrategy: "official" | "vendored" | "custom";
  currentTag: "latest" | "alpha" | "workspace";
  latestTagVersion: string;
  alphaTagVersion?: string;
  compatibility:
    | "aligned"
    | "lagging-latest"
    | "alpha-only"
    | "workspace-only"
    | "vendored-by-design";
  note: string;
}

export function getLatestRuntimeLine() {
  return {
    date: "2026-03-20",
    latest: "2.0.0-alpha.77",
    alpha: "2.0.0-alpha.85",
  };
}

export function getNativePackageAudit(config: EnvConfig): {
  runtime: ReturnType<typeof getLatestRuntimeLine>;
  packages: NativePackageAuditRecord[];
  summary: {
    aligned: number;
    vendored: number;
    alphaOnly: number;
    laggingLatest: number;
    workspaceOnly: number;
  };
  activeCatalog: ReturnType<typeof getNativePluginCatalog>;
} {
  const packages: NativePackageAuditRecord[] = [
    {
      packageName: "elizaos",
      role: "runtime",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.77",
      alphaTagVersion: "2.0.0-alpha.85",
      compatibility: "alpha-only",
      note: "Primary runtime package now tracks the explicit alpha line.",
    },
    {
      packageName: "@elizaos/core",
      role: "runtime-core",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.77",
      alphaTagVersion: "2.0.0-alpha.85",
      compatibility: "alpha-only",
      note: "Core runtime now tracks the explicit alpha line.",
    },
    {
      packageName: "@elizaos/agent",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "0.25.9",
      alphaTagVersion: "2.0.0-alpha.85",
      compatibility: "alpha-only",
      note: "Standalone Eliza agent package is now installed for registry and runtime-shape alignment on the alpha line.",
    },
    {
      packageName: "@elizaos/autonomous",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.77",
      alphaTagVersion: "2.0.0-alpha.85",
      compatibility: "alpha-only",
      note: "Used as a first-party architectural source on the explicit alpha line.",
    },
    {
      packageName: "@elizaos/skills",
      role: "foundation",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.77",
      alphaTagVersion: "2.0.0-alpha.85",
      compatibility: "alpha-only",
      note: "Skills package now tracks the explicit alpha line.",
    },
    {
      packageName: "@elizaos/plugin-openai",
      role: "provider",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.6.0",
      alphaTagVersion: "2.0.0-alpha.13",
      compatibility: "alpha-only",
      note: "Official provider is only practical on alpha for the 2.x runtime line.",
    },
    {
      packageName: "@elizaos/plugin-anthropic",
      role: "provider",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.5.12",
      alphaTagVersion: "2.0.0-alpha.9",
      compatibility: "alpha-only",
      note: "Official provider is usable through alpha, not latest.",
    },
    {
      packageName: "@elizaos/plugin-pdf",
      role: "provider",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.11",
      alphaTagVersion: "2.0.0-alpha.16",
      compatibility: "alpha-only",
      note: "Official PDF plugin tracks the 2.x line through alpha.",
    },
    {
      packageName: "@elizaos/plugin-sql",
      role: "provider",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "2.0.0-alpha.11",
      alphaTagVersion: "2.0.0-alpha.17",
      compatibility: "alpha-only",
      note: "SQL stays on alpha to match the modern runtime path.",
    },
    {
      packageName: "@elizaos/plugin-telegram",
      role: "messaging",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.6.4",
      alphaTagVersion: "2.0.0-alpha.11",
      compatibility: "alpha-only",
      note: "Official Telegram plugin is still 1.x on latest, so alpha is the usable modern line.",
    },
    {
      packageName: "@elizaos/plugin-discord",
      role: "messaging",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.3.8",
      alphaTagVersion: "2.0.0-alpha.10",
      compatibility: "vendored-by-design",
      note: "Vendored because official tags still trail or pin older runtime assumptions.",
    },
    {
      packageName: "@elizaos/plugin-browser",
      role: "browser",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.0.3",
      alphaTagVersion: "2.0.0-alpha.9",
      compatibility: "alpha-only",
      note: "Installed for ecosystem alignment, but still pinned to early alpha-era peer assumptions and needs careful runtime adoption.",
    },
    {
      packageName: "@elizaos/plugin-mcp",
      role: "integration",
      currentStrategy: "official",
      currentTag: "alpha",
      latestTagVersion: "1.8.2",
      alphaTagVersion: "2.0.0-alpha.6",
      compatibility: "alpha-only",
      note: "Installed as the first-party MCP path, but still carries alpha.3 core assumptions and needs mediated adoption.",
    },
    {
      packageName: "@elizaos/plugin-knowledge",
      role: "knowledge",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.6.1",
      alphaTagVersion: "2.0.0-alpha.7",
      compatibility: "vendored-by-design",
      note: "Vendored to avoid 1.x latest drift and heavier mismatched dependency trees.",
    },
    {
      packageName: "@elizaos/plugin-local-embedding",
      role: "knowledge",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.3",
      alphaTagVersion: "2.0.0-alpha.11",
      compatibility: "vendored-by-design",
      note: "Official package is close, but its latest line still pins older alpha-era core.",
    },
    {
      packageName: "@elizaos/plugin-personality",
      role: "knowledge",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.1",
      alphaTagVersion: "2.0.0-alpha.8",
      compatibility: "workspace-only",
      note: "Official package still publishes workspace-based core assumptions.",
    },
    {
      packageName: "@elizaos/plugin-rolodex",
      role: "knowledge",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.3",
      alphaTagVersion: "2.0.0-alpha.9",
      compatibility: "vendored-by-design",
      note: "Vendored to normalize older pinned-core assumptions.",
    },
    {
      packageName: "@elizaos/plugin-experience",
      role: "knowledge",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.1",
      alphaTagVersion: "2.0.0-alpha.10",
      compatibility: "workspace-only",
      note: "Official package still carries workspace-only core references.",
    },
    {
      packageName: "@elizaos/plugin-shell",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.2.0",
      alphaTagVersion: "2.0.0-alpha.9",
      compatibility: "vendored-by-design",
      note: "Vendored because latest remains on the 1.x generation.",
    },
    {
      packageName: "@elizaos/plugin-coding-agent",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "0.1.0-next.0",
      alphaTagVersion: "0.1.0-alpha.1",
      compatibility: "vendored-by-design",
      note: "Still early-stage; kept vendored behind the stable app shell.",
    },
    {
      packageName: "@elizaos/plugin-agent-orchestrator",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "0.3.9",
      alphaTagVersion: "0.3.16",
      compatibility: "vendored-by-design",
      note: "Modern enough for 2.x, but still best controlled through local vendoring.",
    },
    {
      packageName: "@elizaos/plugin-plugin-manager",
      role: "execution",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.3",
      alphaTagVersion: "2.0.0-alpha.7",
      compatibility: "vendored-by-design",
      note: "Official latest still pins alpha.3 core directly.",
    },
    {
      packageName: "@elizaos/plugin-cron",
      role: "automation",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.3",
      alphaTagVersion: "2.0.0-alpha.7",
      compatibility: "vendored-by-design",
      note: "Vendored to avoid older alpha-era core and CLI coupling.",
    },
    {
      packageName: "@elizaos/plugin-agent-skills",
      role: "automation",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "1.0.0",
      alphaTagVersion: "2.0.0-alpha.70",
      compatibility: "workspace-only",
      note: "Latest is 1.x; alpha is modern but still publishes workspace-style assumptions.",
    },
    {
      packageName: "@elizaos/plugin-trajectory-logger",
      role: "automation",
      currentStrategy: "vendored",
      currentTag: "workspace",
      latestTagVersion: "2.0.0-alpha.1",
      alphaTagVersion: "2.0.0-alpha.20",
      compatibility: "workspace-only",
      note: "Vendored because official tags still assume workspace-bound core.",
    },
  ];

  const summary = {
    aligned: packages.filter((entry) => entry.compatibility === "aligned")
      .length,
    vendored: packages.filter(
      (entry) => entry.compatibility === "vendored-by-design",
    ).length,
    alphaOnly: packages.filter((entry) => entry.compatibility === "alpha-only")
      .length,
    laggingLatest: packages.filter(
      (entry) => entry.compatibility === "lagging-latest",
    ).length,
    workspaceOnly: packages.filter(
      (entry) => entry.compatibility === "workspace-only",
    ).length,
  };

  return {
    runtime: getLatestRuntimeLine(),
    packages,
    summary,
    activeCatalog: getNativePluginCatalog(config),
  };
}
