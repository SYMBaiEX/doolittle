import { describe, expect, it } from "bun:test";
import {
  buildSetupReadinessSummary,
  buildUpdateReadinessSummary,
} from "./readiness";

const emptyPluginManager = {
  available: false,
  total: 0,
  enabled: 0,
  official: 0,
  vendored: 0,
  categories: 0,
};

describe("buildSetupReadinessSummary", () => {
  it("blocks setup when directories are missing or no provider is ready", () => {
    const summary = buildSetupReadinessSummary({
      directories: [
        { label: "workspace", path: "/tmp/workspace", exists: false },
        { label: "data", path: "/tmp/data", exists: true },
      ],
      providers: [
        { id: "openai", ready: false, detail: "Missing OPENAI_API_KEY." },
      ],
      transports: [
        {
          id: "discord",
          ready: false,
          detail: "Discord transport is not available.",
        },
      ],
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 0,
        },
        pluginManager: emptyPluginManager,
        pipeline: undefined,
      },
    });

    expect(summary.level).toBe("blocked");
    expect(summary.headline).toContain("Core runtime directories");
    expect(summary.nextSteps).toContain(
      "Run `doolittle setup` to recreate missing runtime directories before relying on automation.",
    );
  });

  it("marks setup as needs-attention when secondary runtime surfaces are still unhealthy", () => {
    const summary = buildSetupReadinessSummary({
      directories: [
        { label: "workspace", path: "/tmp/workspace", exists: true },
      ],
      providers: [
        { id: "openai", ready: true, detail: "Configured for gpt-5.4." },
      ],
      transports: [
        {
          id: "discord",
          ready: false,
          detail: "Discord transport is not available.",
        },
      ],
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 2,
        },
        pluginManager: emptyPluginManager,
        pipeline: {
          total: 5,
          workflows: 2,
          failed: 1,
          failedWorkflows: 1,
        },
      },
    });

    expect(summary.level).toBe("needs-attention");
    expect(summary.detail).toContain("compatibility failures 2");
    expect(summary.detail).toContain("failed workflows 1");
    expect(summary.nextSteps).toContain(
      "Inspect failed autocoder workflows before trusting generated mutations.",
    );
  });

  it("reports setup as ready when providers, transports, and ecosystem are healthy", () => {
    const summary = buildSetupReadinessSummary({
      directories: [
        { label: "workspace", path: "/tmp/workspace", exists: true },
        { label: "data", path: "/tmp/data", exists: true },
      ],
      providers: [
        { id: "openai", ready: true, detail: "Configured for gpt-5.4." },
      ],
      transports: [{ id: "discord", ready: true, detail: "Gateway ready." }],
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 0,
        },
        pluginManager: emptyPluginManager,
        pipeline: {
          total: 5,
          workflows: 2,
          failed: 0,
          failedWorkflows: 0,
        },
      },
    });

    expect(summary.level).toBe("ready");
    expect(summary.headline).toContain("look ready");
    expect(summary.nextSteps).toEqual([
      "Keep `/doctor` and `bun run check` as the standard validation loop after configuration changes.",
    ]);
  });
});

describe("buildUpdateReadinessSummary", () => {
  it("marks non-git workspaces as needs-attention with repository guidance", () => {
    const summary = buildUpdateReadinessSummary({
      repositoryAvailable: false,
      repositoryStatus: "(workspace is not inside a git repository)",
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 0,
        },
        pluginManager: emptyPluginManager,
        pipeline: undefined,
      },
    });

    expect(summary.level).toBe("needs-attention");
    expect(summary.headline).toContain("not a git repository");
    expect(summary.nextSteps).toContain(
      "Initialize or open the workspace inside git if you want update previews tied to commit history.",
    );
  });

  it("marks dirty or unhealthy repositories as needs-attention", () => {
    const summary = buildUpdateReadinessSummary({
      repositoryAvailable: true,
      repositoryStatus: " M packages/agent/src/cli.ts",
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 1,
        },
        pluginManager: emptyPluginManager,
        pipeline: {
          total: 5,
          workflows: 2,
          failed: 1,
          failedWorkflows: 1,
        },
      },
    });

    expect(summary.level).toBe("needs-attention");
    expect(summary.detail).toContain("workspace has pending changes");
    expect(summary.nextSteps).toContain(
      "Review git status before updating runtime dependencies or publishing package changes.",
    );
  });

  it("reports ready when repository and runtime signals are healthy", () => {
    const summary = buildUpdateReadinessSummary({
      repositoryAvailable: true,
      repositoryStatus: "clean",
      condensed: {
        ownership: undefined,
        ecosystem: {
          registryAvailable: true,
          registryPlugins: 4,
          skillCatalogAvailable: true,
          skillCatalogSkills: 12,
          compatibilityFailures: 0,
        },
        pluginManager: emptyPluginManager,
        pipeline: {
          total: 5,
          workflows: 2,
          failed: 0,
          failedWorkflows: 0,
        },
      },
    });

    expect(summary.level).toBe("ready");
    expect(summary.headline).toContain("looks healthy");
    expect(summary.nextSteps).toEqual([
      "Run `bun install`, `bun run typecheck`, `bun test`, and `bun run build` after dependency changes.",
    ]);
  });
});
