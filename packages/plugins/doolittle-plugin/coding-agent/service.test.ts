import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
import type { ServiceClass } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createCodingAgentServiceClass } from "./service";

describe("coding agent service", () => {
  it("owns workspace and repository inspection behind the Eliza service lifecycle", async () => {
    const workspace = {
      root: vi.fn(() => "/workspace"),
      summary: vi.fn((limit = 40) => `tree:${limit}`),
      read: vi.fn((path: string) => `read:${path}`),
      write: vi.fn((path: string, content: string) => `${path}:${content}`),
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

    const CodingAgentService = createCodingAgentServiceClass({
      workspaceRoot: "/workspace",
      workspace,
      repository,
      shell: { run: vi.fn() },
      delegation: { list: vi.fn(() => []) },
      inspectProject,
      findCodebases,
    }) as ServiceClass;
    const service = (await CodingAgentService.start(
      {} as never,
    )) as unknown as {
      workspaceRoot(): string;
      workspaceSummary(limit?: number): string;
      repoStatus(): Promise<string>;
      inspectProject(path?: string): Promise<unknown>;
      findCodebases(query: string): Promise<unknown>;
    };

    expect(CodingAgentService.serviceType).toBe(DOOLITTLE_CODING_AGENT_SERVICE);
    expect(service.workspaceRoot()).toBe("/workspace");
    expect(service.workspaceSummary(12)).toBe("tree:12");
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
  });
});
