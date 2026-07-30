import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import {
  findLocalCodebases,
  inspectLocalProject,
} from "@/services/project-inspection";
import type { RuntimeLike } from "../runtime";
import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  findNativeLocalCodebases,
  getEffectiveCachedMcpTools,
  getEffectiveMcpStatus,
  getEffectiveShellHistory,
  getEffectiveShellStatus,
  getNativeRepositoryDiff,
  getNativeRepositoryLog,
  getNativeRepositoryStatus,
  inspectNativeProject,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  probeEffectiveMcp,
  readNativeWorkspaceFile,
  runEffectiveShellCommand,
  searchEffectiveCachedMcpTools,
  searchNativeWorkspace,
  writeNativeWorkspaceFile,
} from "./index";

describe("tooling bridge helpers", () => {
  it("prefers native shell, mcp, workspace, and repository bridges", async () => {
    const runtime = {
      getService(name: string) {
        if (name === "shell") {
          return {
            run: async (command: string) => `native-shell:${command}`,
            history: (limit = 10) => [`native-history:${limit}`],
            status: async () => ({ source: "native-shell" }),
          };
        }
        if (name === "mcp") {
          return {
            status: () => ({ source: "native-mcp" }),
            probe: async () => ({ ok: true, source: "native-mcp" }),
            discoverTools: async () => [{ name: "native-tool" }],
            getCachedTools: () => [{ name: "native-tool" }],
            searchCachedTools: (query: string) => [`native-search:${query}`],
            describeCachedTools: (limit = 20) => `native-describe:${limit}`,
            describeTool: (name: string) => `native-tool:${name}`,
            invoke: async (input: string) => `native-invoke:${input}`,
            invokeTool: async (
              name: string,
              input: Record<string, unknown>,
            ) => ({ name, input, source: "native-mcp" }),
          };
        }
        if (name === "coding_agent") {
          return {
            workspaceRoot: () => "/tmp/native",
            workspaceSummary: (limit = 40) => `native-summary:${limit}`,
            run: async (command: string) => `native-coding-run:${command}`,
            read: (path: string) => `native-read:${path}`,
            search: (query: string, limit = 20) => [
              `native-search:${query}:${limit}`,
            ],
            write: (path: string, content: string) => ({
              path,
              content,
              source: "native-write",
            }),
            inspectProject: async (projectPath: string) => ({
              name: "native-project",
              path: projectPath,
              type: "native",
              workspacePatterns: [],
              scripts: [],
              keyFolders: [],
              git: { available: false },
              topEntries: [],
            }),
            findCodebases: async (query: string) => [
              {
                path: `/tmp/${query}`,
                exactBasenameMatch: true,
              },
            ],
            repoStatus: async () => ({ source: "native-repo-status" }),
            repoDiff: async () => ({ source: "native-repo-diff" }),
            repoLog: async (limit = 10) => [`native-repo-log:${limit}`],
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      terminal: {
        run: async (command: string) => `fallback-shell:${command}`,
        recent: (limit = 10) => [`fallback-history:${limit}`],
        status: async () => ({ source: "fallback-shell" }),
      },
      mcp: {
        status: () => ({ source: "fallback-mcp" }),
        probe: async () => ({ ok: true, source: "fallback-mcp" }),
        discoverTools: async () => [{ name: "fallback-tool" }],
        getCachedTools: () => [{ name: "fallback-tool" }],
        searchCachedTools: (query: string) => [`fallback-search:${query}`],
        describeCachedTools: (limit = 20) => `fallback-describe:${limit}`,
        describeTool: (name: string) => `fallback-tool:${name}`,
        invoke: async (input: string) => `fallback-invoke:${input}`,
        invokeTool: async (name: string, input: Record<string, unknown>) => ({
          name,
          input,
          source: "fallback-mcp",
        }),
      },
      workspace: {
        read: (path: string) => `fallback-read:${path}`,
        search: (query: string, limit = 20) => [
          `fallback-search:${query}:${limit}`,
        ],
        write: (path: string, content: string) => ({
          path,
          content,
          source: "fallback-write",
        }),
        root: () => "/tmp/fallback-workspace",
      },
      repository: {
        isRepository: () => false,
        status: async () => ({ source: "fallback-repo-status" }),
        diffStat: async () => ({ source: "fallback-repo-diff" }),
        recentCommits: async (limit = 10) => [`fallback-repo-log:${limit}`],
      },
    } as unknown as AppServices;

    expect(await runEffectiveShellCommand(runtime, services, "pwd")).toBe(
      "native-shell:pwd",
    );
    expect(getEffectiveMcpStatus(runtime, services)).toEqual({
      source: "native-mcp",
    });
    await expect(probeEffectiveMcp(runtime, services)).resolves.toEqual({
      ok: true,
      source: "native-mcp",
    });
    await expect(discoverEffectiveMcpTools(runtime, services)).resolves.toEqual(
      [{ name: "native-tool" }],
    );
    expect(getEffectiveCachedMcpTools(runtime, services)).toEqual([
      { name: "native-tool" },
    ]);
    expect(searchEffectiveCachedMcpTools(runtime, services, "tool")).toEqual([
      "native-search:tool",
    ]);
    expect(describeEffectiveCachedMcpTools(runtime, services, 5)).toBe(
      "native-describe:5",
    );
    expect(describeEffectiveMcpTool(runtime, services, "tool-1")).toBe(
      "native-tool:tool-1",
    );
    await expect(invokeEffectiveMcp(runtime, services, "ping")).resolves.toBe(
      "native-invoke:ping",
    );
    await expect(
      invokeEffectiveMcpTool(runtime, services, "tool-1", { ok: true }),
    ).resolves.toEqual({
      name: "tool-1",
      input: { ok: true },
      source: "native-mcp",
    });
    expect(getEffectiveShellHistory(runtime, services, 3)).toEqual([
      "native-history:3",
    ]);
    await expect(getEffectiveShellStatus(runtime, services)).resolves.toEqual({
      source: "native-shell",
    });
    expect(readNativeWorkspaceFile(runtime, "README.md")).toBe(
      "native-read:README.md",
    );
    await expect(searchNativeWorkspace(runtime, "todo", 4)).resolves.toEqual([
      "native-search:todo:4",
    ]);
    await expect(
      writeNativeWorkspaceFile(runtime, "notes.md", "hello"),
    ).resolves.toEqual({
      path: "notes.md",
      content: "hello",
      source: "native-write",
    });
    await expect(
      inspectNativeProject(runtime, "/tmp/project"),
    ).resolves.toMatchObject({
      name: "native-project",
      path: "/tmp/project",
    });
    await expect(getNativeRepositoryStatus(runtime)).resolves.toEqual({
      source: "native-repo-status",
    });
    await expect(getNativeRepositoryDiff(runtime)).resolves.toEqual({
      source: "native-repo-diff",
    });
    await expect(getNativeRepositoryLog(runtime, 2)).resolves.toEqual([
      "native-repo-log:2",
    ]);
  });

  it("keeps product fallbacks for shell and mcp but requires the native coding service", async () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    const services = {
      terminal: {
        run: async (command: string) => `fallback-shell:${command}`,
        recent: (limit = 10) => [`fallback-history:${limit}`],
        status: async () => ({ source: "fallback-shell" }),
      },
      mcp: {
        status: () => ({ source: "fallback-mcp" }),
        probe: async () => ({ ok: true, source: "fallback-mcp" }),
        discoverTools: async () => [{ name: "fallback-tool" }],
        getCachedTools: () => [{ name: "fallback-tool" }],
        searchCachedTools: (query: string) => [`fallback-search:${query}`],
        describeCachedTools: (limit = 20) => `fallback-describe:${limit}`,
        describeTool: (name: string) => `fallback-tool:${name}`,
        invoke: async (input: string) => `fallback-invoke:${input}`,
        invokeTool: async (name: string, input: Record<string, unknown>) => ({
          name,
          input,
          source: "fallback-mcp",
        }),
      },
      workspace: {
        read: (path: string) => `fallback-read:${path}`,
        search: (query: string, limit = 20) => [
          `fallback-search:${query}:${limit}`,
        ],
        write: (path: string, content: string) => ({
          path,
          content,
          source: "fallback-write",
        }),
        root: () => "/tmp/fallback-workspace",
      },
      repository: {
        isRepository: () => true,
        status: async () => ({ source: "fallback-repo-status" }),
        diffStat: async () => ({ source: "fallback-repo-diff" }),
        recentCommits: async (limit = 10) => [`fallback-repo-log:${limit}`],
      },
    } as unknown as AppServices;

    expect(await runEffectiveShellCommand(runtime, services, "pwd")).toBe(
      "fallback-shell:pwd",
    );
    expect(getEffectiveMcpStatus(runtime, services)).toEqual({
      source: "fallback-mcp",
    });
    await expect(probeEffectiveMcp(runtime, services)).resolves.toEqual({
      ok: true,
      source: "fallback-mcp",
    });
    await expect(discoverEffectiveMcpTools(runtime, services)).resolves.toEqual(
      [{ name: "fallback-tool" }],
    );
    expect(getEffectiveCachedMcpTools(runtime, services)).toEqual([
      { name: "fallback-tool" },
    ]);
    expect(searchEffectiveCachedMcpTools(runtime, services, "tool")).toEqual([
      "fallback-search:tool",
    ]);
    expect(describeEffectiveCachedMcpTools(runtime, services, 5)).toBe(
      "fallback-describe:5",
    );
    expect(describeEffectiveMcpTool(runtime, services, "tool-1")).toBe(
      "fallback-tool:tool-1",
    );
    await expect(invokeEffectiveMcp(runtime, services, "ping")).resolves.toBe(
      "fallback-invoke:ping",
    );
    await expect(
      invokeEffectiveMcpTool(runtime, services, "tool-1", { ok: true }),
    ).resolves.toEqual({
      name: "tool-1",
      input: { ok: true },
      source: "fallback-mcp",
    });
    expect(getEffectiveShellHistory(runtime, services, 3)).toEqual([
      "fallback-history:3",
    ]);
    await expect(getEffectiveShellStatus(runtime, services)).resolves.toEqual({
      source: "fallback-shell",
    });
    await expect(
      Promise.resolve().then(() =>
        readNativeWorkspaceFile(runtime, "README.md"),
      ),
    ).rejects.toThrow(/coding_agent/u);
    await expect(searchNativeWorkspace(runtime, "todo", 4)).rejects.toThrow(
      /coding_agent/u,
    );
    await expect(
      writeNativeWorkspaceFile(runtime, "notes.md", "hello"),
    ).rejects.toThrow(/coding_agent/u);

    await expect(getNativeRepositoryStatus(runtime)).rejects.toThrow(
      /coding_agent/u,
    );
    await expect(getNativeRepositoryDiff(runtime)).rejects.toThrow(
      /coding_agent/u,
    );
    await expect(getNativeRepositoryLog(runtime, 2)).rejects.toThrow(
      /coding_agent/u,
    );
  });

  it("routes project inspection and codebase discovery through the native coding service", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "service-bridge-tooling-"));
    const projectName = `native-bridge-${randomUUID()}`;
    const projectPath = join(tempRoot, projectName);
    vi.stubEnv("HOME", tempRoot);

    mkdirSync(projectPath, { recursive: true });
    mkdirSync(join(projectPath, "src"));
    writeFileSync(
      join(projectPath, "package.json"),
      JSON.stringify(
        {
          name: "@doolittle/native-bridge-test",
          packageManager: "bun@1.3.11",
          workspaces: ["packages/*"],
          scripts: { test: "bun test", build: "bun run build" },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(projectPath, "README.md"),
      "# Native bridge test\n\nThis is a fallback inspection test.\n",
    );

    const runtime = {
      getService(name: string) {
        if (name === "coding_agent") {
          return {
            inspectProject: (targetPath: string) =>
              inspectLocalProject(targetPath),
            findCodebases: (query: string) =>
              findLocalCodebases(query, tempRoot),
          };
        }
        return null;
      },
    } as unknown as RuntimeLike;

    try {
      const inspection = await inspectNativeProject(runtime, projectPath);
      const matches = await findNativeLocalCodebases(runtime, projectName);
      const normalizedMatches = matches.map((entry) => ({
        ...entry,
        path: entry.path.replace(/\/$/u, ""),
      }));

      expect(inspection.path).toBe(projectPath);
      expect(inspection.packageName).toBe("@doolittle/native-bridge-test");
      expect(inspection.scripts).toContain("build");
      expect(
        normalizedMatches.some((entry) => entry.path === projectPath),
      ).toBe(true);
      expect(
        normalizedMatches.some(
          (entry) => entry.path === projectPath && entry.exactBasenameMatch,
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  }, 15_000);
});
