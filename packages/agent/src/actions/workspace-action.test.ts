import { describe, expect, it } from "vitest";
import {
  createWorkspaceAction,
  resolveWorkspaceIntentFromParams,
} from "./workspace-action";

describe("resolveWorkspaceIntentFromParams", () => {
  it("parses broad inspection intents from action parameters", () => {
    expect(
      resolveWorkspaceIntentFromParams({
        intent: "overview",
        path: "packages/agent",
      }),
    ).toEqual({
      kind: "overview",
      path: "packages/agent",
    });
  });
});

describe("workspace action contract", () => {
  it("is planner-selectable and executes structured parameters first", async () => {
    const action = createWorkspaceAction();
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "doolittle_coding_agent"
          ? {
              workspaceSummary: () => "workspace tree",
            }
          : null;
      },
    };

    await expect(
      action.validate(
        runtime as never,
        { content: { text: "Please inspect the project." } } as never,
      ),
    ).resolves.toBe(true);
    await expect(
      action.handler(
        runtime as never,
        {
          content: { text: "This text has no legacy workspace intent." },
        } as never,
        undefined,
        { parameters: { intent: "tree" } },
      ),
    ).resolves.toMatchObject({
      success: true,
      text: "workspace tree",
      verifiedUserFacing: true,
    });
    expect(action.parameters?.map((parameter) => parameter.name)).toEqual([
      "intent",
      "path",
      "query",
    ]);
  });

  it("delegates target classification and inspection to the live coding-agent service", async () => {
    const inspectedPaths: Array<string | undefined> = [];
    const action = createWorkspaceAction();
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "doolittle_coding_agent"
          ? {
              resolveProjectTarget: (path: string) =>
                path === "src/index.ts"
                  ? { path: "/workspace/src/index.ts", kind: "file" }
                  : path === "packages/agent"
                    ? { path: "/workspace/packages/agent", kind: "directory" }
                    : undefined,
              inspectProject: async (path?: string) => {
                inspectedPaths.push(path);
                return {
                  name: "agent",
                  path: path ?? "/workspace/current",
                  type: "TypeScript package",
                  workspacePatterns: [],
                  scripts: [],
                  keyFolders: ["src"],
                  git: { available: false },
                  topEntries: ["src"],
                };
              },
            }
          : null;
      },
    };

    await expect(
      action.handler(
        runtime as never,
        { content: { text: "Inspect packages/agent" } } as never,
        undefined,
        { parameters: { intent: "overview", path: "packages/agent" } },
      ),
    ).resolves.toMatchObject({
      success: true,
      text: expect.stringContaining("Path: /workspace/packages/agent"),
    });
    await expect(
      action.handler(
        runtime as never,
        { content: { text: "Find src/index.ts" } } as never,
        undefined,
        { parameters: { intent: "find-codebase", query: "src/index.ts" } },
      ),
    ).resolves.toMatchObject({
      success: true,
      text: "Found file path: /workspace/src/index.ts",
    });
    expect(inspectedPaths).toEqual(["/workspace/packages/agent"]);
  });

  it("inspects the service's current workspace when overview has no path", async () => {
    const action = createWorkspaceAction();
    const inspectedPaths: Array<string | undefined> = [];
    const runtime = {
      getService(serviceType: string) {
        return serviceType === "doolittle_coding_agent"
          ? {
              inspectProject: async (path?: string) => {
                inspectedPaths.push(path);
                return {
                  name: "current",
                  path: "/workspace/switched",
                  type: "project directory",
                  workspacePatterns: [],
                  scripts: [],
                  keyFolders: [],
                  git: { available: false },
                  topEntries: [],
                };
              },
            }
          : null;
      },
    };

    await action.handler(
      runtime as never,
      { content: { text: "What is this project?" } } as never,
      undefined,
      { parameters: { intent: "overview" } },
    );

    expect(inspectedPaths).toEqual([undefined]);
  });
});
