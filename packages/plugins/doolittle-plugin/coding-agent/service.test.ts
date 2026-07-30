import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
import type { ServiceClass } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createCodingAgentServiceClass } from "./service";

describe("coding agent service", () => {
  it("owns workspace and repository inspection behind the Eliza service lifecycle", async () => {
    let currentWorkspaceRoot = "/workspace";
    const workspace = {
      root: vi.fn(() => currentWorkspaceRoot),
      summary: vi.fn((limit = 40) => `tree:${limit}`),
      read: vi.fn((path: string) => `read:${path}`),
      write: vi.fn((path: string, content: string) => `${path}:${content}`),
      readLines: vi.fn((path: string) => ({
        path: `/workspace/${path}`,
        offset: 1,
        end: 1,
        total: 1,
        lines: [{ number: 1, text: "content" }],
      })),
      writeFile: vi.fn(async (path: string, content: string) => ({
        path: `/workspace/${path}`,
        bytes: content.length,
      })),
      createDirectory: vi.fn((path: string) => ({
        path: `/workspace/${path}`,
        existed: false,
      })),
      patch: vi.fn(async (path: string) => ({
        path: `/workspace/${path}`,
        bytes: 10,
        replacements: 1,
      })),
      searchFiles: vi.fn((input: { pattern: string }) => ({
        root: "/workspace",
        pattern: input.pattern,
        target: "content" as const,
        matches: [],
      })),
      search: vi.fn((query: string, limit = 20) => [
        { path: "src/index.ts", matches: [`${query}:${limit}`] },
      ]),
    };
    const repository = {
      isRepository: vi.fn(() => true),
      status: vi.fn(async () => "clean"),
      diffStat: vi.fn(async () => "1 file changed"),
      recentCommits: vi.fn(async (limit = 10) => `commits:${limit}`),
    };
    const inspectProject = vi.fn(async (path: string) => ({
      name: "workspace",
      path,
      type: "typescript",
      workspacePatterns: [],
      scripts: [],
      keyFolders: ["src"],
      git: { available: true },
      topEntries: ["src"],
    }));
    const findCodebases = vi.fn(async (query: string, root: string) => [
      {
        path: `${root}/${query}`,
        exactBasenameMatch: true,
      },
    ]);
    const resolveProjectTarget = vi.fn((inputPath: string, root: string) => ({
      path: `${root}/${inputPath}`,
      kind: "directory" as const,
    }));

    const CodingAgentService = createCodingAgentServiceClass({
      workspace,
      repository,
      shell: { run: vi.fn() },
      delegation: { list: vi.fn(() => []) },
      inspectProject,
      findCodebases,
      resolveProjectTarget,
    }) as ServiceClass;
    const service = (await CodingAgentService.start(
      {} as never,
    )) as unknown as {
      workspaceRoot(): string;
      workspaceSummary(limit?: number): string;
      readLines(path: string): { path: string };
      writeFile(path: string, content: string): Promise<{ bytes: number }>;
      createDirectory(path: string): { path: string };
      patch(
        path: string,
        oldText: string,
        newText: string,
      ): Promise<{ replacements: number }>;
      searchFiles(input: { pattern: string }): { pattern: string };
      repoStatus(): Promise<string>;
      inspectProject(path?: string): Promise<unknown>;
      findCodebases(query: string): Promise<unknown>;
      resolveProjectTarget(path: string): unknown;
      context(taskDescription: string): {
        workingDirectory: string;
        connector: { metadata?: Record<string, string> };
      };
    };

    expect(CodingAgentService.serviceType).toBe(DOOLITTLE_CODING_AGENT_SERVICE);
    expect(service.workspaceRoot()).toBe("/workspace");
    expect(service.workspaceSummary(12)).toBe("tree:12");
    expect(service.readLines("README.md").path).toBe("/workspace/README.md");
    await expect(service.writeFile("notes.md", "hello")).resolves.toMatchObject(
      { bytes: 5 },
    );
    expect(service.createDirectory("src").path).toBe("/workspace/src");
    await expect(
      service.patch("notes.md", "old", "new"),
    ).resolves.toMatchObject({ replacements: 1 });
    expect(service.searchFiles({ pattern: "todo" }).pattern).toBe("todo");
    await expect(service.repoStatus()).resolves.toBe("clean");
    await expect(
      service.inspectProject("/workspace/app"),
    ).resolves.toMatchObject({
      path: "/workspace/app",
    });
    await expect(service.findCodebases("app")).resolves.toEqual([
      {
        path: "/workspace/app",
        exactBasenameMatch: true,
      },
    ]);
    expect(findCodebases).toHaveBeenCalledWith("app", "/workspace");

    currentWorkspaceRoot = "/workspace/switched";
    await expect(service.inspectProject()).resolves.toMatchObject({
      path: "/workspace/switched",
    });
    expect(service.resolveProjectTarget("src")).toEqual({
      path: "/workspace/switched/src",
      kind: "directory",
    });
    expect(resolveProjectTarget).toHaveBeenCalledWith(
      "src",
      "/workspace/switched",
    );
    const context = service.context("Inspect this project");
    expect(context.workingDirectory).toBe("/workspace/switched");
    expect(context.connector.metadata?.workspaceRoot).toBe(
      "/workspace/switched",
    );
  });
});
