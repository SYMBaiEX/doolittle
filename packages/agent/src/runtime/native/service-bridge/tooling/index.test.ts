import { describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodingAgentContext } from "@elizaos/agent/services/coding-agent-context";
import type { AppServices } from "@/services";
import type { RuntimeLike } from "../runtime";
import {
  describeEffectiveCachedMcpTools,
  describeEffectiveMcpTool,
  discoverEffectiveMcpTools,
  findEffectiveLocalCodebases,
  getEffectiveCachedMcpTools,
  getEffectiveCodingAgentContext,
  getEffectiveMcpStatus,
  getEffectiveRepositoryDiff,
  getEffectiveRepositoryLog,
  getEffectiveRepositoryStatus,
  getEffectiveShellHistory,
  getEffectiveShellStatus,
  inspectEffectiveProject,
  invokeEffectiveMcp,
  invokeEffectiveMcpTool,
  probeEffectiveMcp,
  readEffectiveWorkspaceFile,
  runEffectiveShellCommand,
  searchEffectiveCachedMcpTools,
  searchEffectiveWorkspace,
  writeEffectiveWorkspaceFile,
} from "./index";

function makeCodingContext(
  overrides: Partial<CodingAgentContext> = {},
): CodingAgentContext {
  return {
    sessionId: "session-1",
    taskDescription: "Inspect the repo",
    workingDirectory: "/tmp/project",
    connector: {
      type: "local-fs",
      basePath: "/tmp/project",
      available: true,
      metadata: {},
    },
    interactionMode: "human-in-the-loop",
    maxIterations: 8,
    active: true,
    iterations: [],
    allFeedback: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as CodingAgentContext;
}

describe("tooling bridge helpers", () => {
  it("prefers native shell, mcp, workspace, context, and repository bridges", async () => {
    const nativeContext = makeCodingContext({
      sessionId: "native-session",
      connector: {
        type: "git-repo",
        basePath: "/tmp/native",
        available: true,
        metadata: { owner: "native" },
      },
    });

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
            context: () => nativeContext,
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
    expect(readEffectiveWorkspaceFile(runtime, services, "README.md")).toBe(
      "native-read:README.md",
    );
    expect(searchEffectiveWorkspace(runtime, services, "todo", 4)).toEqual([
      "native-search:todo:4",
    ]);
    expect(
      writeEffectiveWorkspaceFile(runtime, services, "notes.md", "hello"),
    ).toEqual({
      path: "notes.md",
      content: "hello",
      source: "native-write",
    });
    expect(
      getEffectiveCodingAgentContext(runtime, services, {
        sessionId: "session-1",
        taskDescription: "Inspect the repo",
        workspaceRoot: "/tmp/project",
      }),
    ).toBe(nativeContext);
    await expect(
      inspectEffectiveProject(runtime, services, "/tmp/project"),
    ).resolves.toMatchObject({
      name: "native-project",
      path: "/tmp/project",
    });
    await expect(
      getEffectiveRepositoryStatus(runtime, services),
    ).resolves.toEqual({
      source: "native-repo-status",
    });
    await expect(
      getEffectiveRepositoryDiff(runtime, services),
    ).resolves.toEqual({
      source: "native-repo-diff",
    });
    await expect(
      getEffectiveRepositoryLog(runtime, services, 2),
    ).resolves.toEqual(["native-repo-log:2"]);
  });

  it("falls back to product shell, mcp, workspace, repository, and context helpers", async () => {
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
    expect(readEffectiveWorkspaceFile(runtime, services, "README.md")).toBe(
      "fallback-read:README.md",
    );
    expect(searchEffectiveWorkspace(runtime, services, "todo", 4)).toEqual([
      "fallback-search:todo:4",
    ]);
    expect(
      writeEffectiveWorkspaceFile(runtime, services, "notes.md", "hello"),
    ).toEqual({
      path: "notes.md",
      content: "hello",
      source: "fallback-write",
    });

    const context = getEffectiveCodingAgentContext(runtime, services, {
      sessionId: "session-2",
      taskDescription: "Plan the work",
      workspaceRoot: "/tmp/fallback-workspace",
      metadata: { owner: "fallback" },
    });

    expect(context.connector.type).toBe("git-repo");
    expect(context.connector.basePath).toBe("/tmp/fallback-workspace");
    expect(context.connector.metadata).toEqual({ owner: "fallback" });
    expect(context.taskDescription).toBe("Plan the work");

    await expect(
      getEffectiveRepositoryStatus(runtime, services),
    ).resolves.toEqual({
      source: "fallback-repo-status",
    });
    await expect(
      getEffectiveRepositoryDiff(runtime, services),
    ).resolves.toEqual({
      source: "fallback-repo-diff",
    });
    await expect(
      getEffectiveRepositoryLog(runtime, services, 2),
    ).resolves.toEqual(["fallback-repo-log:2"]);
  });

  it(
    "falls back to local project inspection and codebase discovery",
    async () => {
      const tempRoot = mkdtempSync(join(tmpdir(), "service-bridge-tooling-"));
      const projectName = `native-bridge-${randomUUID()}`;
      const projectPath = join(tempRoot, projectName);

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
        getService() {
          return null;
        },
      } as unknown as RuntimeLike;

      const services = {
        workspace: {
          root: () => tempRoot,
        },
      } as unknown as AppServices;

      try {
        const inspection = await inspectEffectiveProject(
          runtime,
          services,
          projectPath,
        );
        const matches = await findEffectiveLocalCodebases(
          runtime,
          services,
          projectName,
        );
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
        rmSync(tempRoot, { recursive: true, force: true });
      }
    },
    { timeout: 15_000 },
  );
});
