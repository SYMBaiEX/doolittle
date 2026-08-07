import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOOLITTLE_MCP_SERVICE,
  DOOLITTLE_SHELL_SERVICE,
} from "@doolittle/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  findLocalCodebases,
  inspectLocalProject,
} from "@/services/project-inspection";
import type { RuntimeLike } from "../runtime";
import {
  createNativeWorkspaceDirectory,
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
  patchNativeWorkspaceFile,
  probeEffectiveMcp,
  readNativeWorkspaceFile,
  readNativeWorkspaceFileLines,
  runEffectiveShellCommand,
  searchEffectiveCachedMcpTools,
  searchNativeWorkspace,
  searchNativeWorkspaceFiles,
  writeNativeWorkspaceFile,
  writeNativeWorkspaceFileResult,
} from "./index";

describe("tooling bridge helpers", () => {
  it("prefers native shell, mcp, workspace, and repository bridges", async () => {
    const runtime = {
      getService(name: string) {
        if (name === DOOLITTLE_SHELL_SERVICE) {
          return {
            run: async (command: string) => `native-shell:${command}`,
            history: (limit = 10) => [`native-history:${limit}`],
            status: async () => ({ source: "native-shell" }),
          };
        }
        if (name === DOOLITTLE_MCP_SERVICE) {
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
        if (name === "doolittle_coding_agent") {
          return {
            workspaceRoot: () => "/tmp/native",
            workspaceSummary: (limit = 40) => `native-summary:${limit}`,
            run: async (command: string) => `native-coding-run:${command}`,
            read: (path: string) => `native-read:${path}`,
            readLines: (path: string, options: unknown) => ({
              path,
              options,
              source: "native-read-lines",
            }),
            search: (query: string, limit = 20) => [
              `native-search:${query}:${limit}`,
            ],
            write: (path: string, content: string) => ({
              path,
              content,
              source: "native-write",
            }),
            writeFile: async (path: string, content: string) => ({
              path,
              bytes: content.length,
              source: "native-write-file",
            }),
            createDirectory: (path: string) => ({
              path,
              existed: false,
              source: "native-directory",
            }),
            patch: async (
              path: string,
              oldText: string,
              newText: string,
              options: unknown,
            ) => ({
              path,
              oldText,
              newText,
              options,
              source: "native-patch",
            }),
            searchFiles: (input: unknown) => ({
              input,
              source: "native-search-files",
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

    expect(await runEffectiveShellCommand(runtime, "pwd")).toBe(
      "native-shell:pwd",
    );
    expect(getEffectiveMcpStatus(runtime)).toEqual({
      source: "native-mcp",
    });
    await expect(probeEffectiveMcp(runtime)).resolves.toEqual({
      ok: true,
      source: "native-mcp",
    });
    await expect(discoverEffectiveMcpTools(runtime)).resolves.toEqual([
      { name: "native-tool" },
    ]);
    expect(getEffectiveCachedMcpTools(runtime)).toEqual([
      { name: "native-tool" },
    ]);
    expect(searchEffectiveCachedMcpTools(runtime, "tool")).toEqual([
      "native-search:tool",
    ]);
    expect(describeEffectiveCachedMcpTools(runtime, 5)).toBe(
      "native-describe:5",
    );
    expect(describeEffectiveMcpTool(runtime, "tool-1")).toBe(
      "native-tool:tool-1",
    );
    await expect(invokeEffectiveMcp(runtime, "ping")).resolves.toBe(
      "native-invoke:ping",
    );
    await expect(
      invokeEffectiveMcpTool(runtime, "tool-1", { ok: true }),
    ).resolves.toEqual({
      name: "tool-1",
      input: { ok: true },
      source: "native-mcp",
    });
    expect(getEffectiveShellHistory(runtime, 3)).toEqual(["native-history:3"]);
    await expect(getEffectiveShellStatus(runtime)).resolves.toEqual({
      source: "native-shell",
    });
    expect(readNativeWorkspaceFile(runtime, "README.md")).toBe(
      "native-read:README.md",
    );
    expect(
      readNativeWorkspaceFileLines(runtime, "README.md", {
        offset: 2,
        limit: 4,
      }),
    ).toEqual({
      path: "README.md",
      options: { offset: 2, limit: 4 },
      source: "native-read-lines",
    });
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
      writeNativeWorkspaceFileResult(runtime, "notes.md", "hello"),
    ).resolves.toEqual({
      path: "notes.md",
      bytes: 5,
      source: "native-write-file",
    });
    expect(createNativeWorkspaceDirectory(runtime, "src")).toEqual({
      path: "src",
      existed: false,
      source: "native-directory",
    });
    await expect(
      patchNativeWorkspaceFile(runtime, "notes.md", "old", "new", {
        replaceAll: true,
      }),
    ).resolves.toEqual({
      path: "notes.md",
      oldText: "old",
      newText: "new",
      options: { replaceAll: true },
      source: "native-patch",
    });
    expect(
      searchNativeWorkspaceFiles(runtime, {
        pattern: "todo",
        path: "src",
      }),
    ).toEqual({
      input: { pattern: "todo", path: "src" },
      source: "native-search-files",
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

  it("requires lifecycle-owned shell, MCP, and coding services", async () => {
    const runtime = {
      getService() {
        return null;
      },
    } as unknown as RuntimeLike;

    await expect(runEffectiveShellCommand(runtime, "pwd")).rejects.toThrow(
      /Required Eliza service doolittle_shell/u,
    );
    expect(() => getEffectiveMcpStatus(runtime)).toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    await expect(probeEffectiveMcp(runtime)).rejects.toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    await expect(discoverEffectiveMcpTools(runtime)).rejects.toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    expect(() => getEffectiveCachedMcpTools(runtime)).toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    expect(() => searchEffectiveCachedMcpTools(runtime, "tool")).toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    expect(() => describeEffectiveCachedMcpTools(runtime, 5)).toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    expect(() => describeEffectiveMcpTool(runtime, "tool-1")).toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    await expect(invokeEffectiveMcp(runtime, "ping")).rejects.toThrow(
      /Required Eliza service doolittle_mcp/u,
    );
    await expect(
      invokeEffectiveMcpTool(runtime, "tool-1", { ok: true }),
    ).rejects.toThrow(/Required Eliza service doolittle_mcp/u);
    expect(() => getEffectiveShellHistory(runtime, 3)).toThrow(
      /Required Eliza service doolittle_shell/u,
    );
    await expect(getEffectiveShellStatus(runtime)).rejects.toThrow(
      /Required Eliza service doolittle_shell/u,
    );
    await expect(
      Promise.resolve().then(() =>
        readNativeWorkspaceFile(runtime, "README.md"),
      ),
    ).rejects.toThrow(/coding_agent/u);
    await expect(
      Promise.resolve().then(() =>
        readNativeWorkspaceFileLines(runtime, "README.md"),
      ),
    ).rejects.toThrow(/coding_agent/u);
    await expect(searchNativeWorkspace(runtime, "todo", 4)).rejects.toThrow(
      /coding_agent/u,
    );
    await expect(
      writeNativeWorkspaceFile(runtime, "notes.md", "hello"),
    ).rejects.toThrow(/coding_agent/u);
    await expect(
      writeNativeWorkspaceFileResult(runtime, "notes.md", "hello"),
    ).rejects.toThrow(/coding_agent/u);
    await expect(
      Promise.resolve().then(() =>
        createNativeWorkspaceDirectory(runtime, "src"),
      ),
    ).rejects.toThrow(/coding_agent/u);
    await expect(
      patchNativeWorkspaceFile(runtime, "notes.md", "old", "new"),
    ).rejects.toThrow(/coding_agent/u);
    await expect(
      Promise.resolve().then(() =>
        searchNativeWorkspaceFiles(runtime, { pattern: "todo" }),
      ),
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
        if (name === "doolittle_coding_agent") {
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
