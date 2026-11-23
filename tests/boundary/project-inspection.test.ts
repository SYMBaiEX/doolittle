import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOOLITTLE_CODING_AGENT_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime } from "@elizaos/core";
import { expect, it, vi } from "vitest";
import { executeWorkspaceIntent } from "../../packages/agent/src/actions/workspace-action/execution";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import {
  inspectLocalProject,
  resolveLocalProjectTarget,
} from "../../packages/agent/src/services/project-inspection";

function workspaceRuntime(workspace: string) {
  const service = {
    resolveProjectTarget: (path: string) =>
      resolveLocalProjectTarget(path, workspace),
    inspectProject: (path: string) => inspectLocalProject(path),
    findCodebases: vi.fn(async (_query: string) => []),
  };
  const runtime = {
    getService: (name: string) =>
      name === DOOLITTLE_CODING_AGENT_SERVICE ? service : null,
  } as unknown as IAgentRuntime;
  return { runtime, service };
}

it.each([
  ...["café", "项目", "café.txt", "项目.txt"].map((name) => [name, name]),
  ...[
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["“", "”"],
    ["‘", "’"],
  ].flatMap(([open, close]) =>
    ["README.md", "café"].map((name) => [name, `${open}${name}${close}`]),
  ),
])(
  "finds the exact project path %s from query %s before discovery",
  async (name, query) => {
    const fixture = await mkdtemp(join(tmpdir(), "doolittle-project-find-"));
    try {
      const path = join(fixture, name);
      if (name.endsWith(".txt") || name.endsWith(".md")) {
        await writeFile(path, "fixture");
      } else {
        await mkdir(path);
      }
      await mkdir(join(fixture, "caf"));
      const { runtime, service } = workspaceRuntime(fixture);
      const output = await executeWorkspaceIntent(runtime, {
        kind: "find-codebase",
        query: `  ${query}  `,
      });
      expect(output).toContain(path);
      expect(service.findCodebases).not.toHaveBeenCalled();
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

it.each([
  ["missing café!", "missing caf"],
  ["项目", undefined],
  ["   ", undefined],
])(
  "uses sanitized discovery for an unresolved query %j",
  async (query, sanitized) => {
    const fixture = await mkdtemp(join(tmpdir(), "doolittle-project-find-"));
    try {
      const { runtime, service } = workspaceRuntime(fixture);
      const output = await executeWorkspaceIntent(runtime, {
        kind: "find-codebase",
        query,
      });
      if (sanitized) {
        expect(service.findCodebases).toHaveBeenCalledWith(sanitized);
      } else {
        expect(service.findCodebases).not.toHaveBeenCalled();
        expect(output).toBe(
          "I couldn't determine the codebase name to search for.",
        );
      }
      service.findCodebases.mockRejectedValueOnce(
        new Error("Discovery failed"),
      );
      await expect(
        executeWorkspaceIntent(runtime, {
          kind: "find-codebase",
          query: "missing",
        }),
      ).rejects.toThrow("Discovery failed");
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  },
);

it("returns the ranked entrypoints and metadata from the inspected directory", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "doolittle-project-inspect-"));
  try {
    const project = join(fixture, "app");
    await mkdir(join(project, "src", "nested"), { recursive: true });
    await mkdir(join(project, "src", "_generated"));
    await mkdir(join(project, "node_modules"));
    await mkdir(join(fixture, "outside"));
    await Promise.all([
      writeFile(
        join(project, "package.json"),
        JSON.stringify({
          name: "fixture",
          workspaces: ["apps/*"],
          scripts: { build: "fixture build" },
        }),
      ),
      writeFile(join(project, "README.md"), "  Title  \n\r\nSummary\nunused"),
      writeFile(join(project, ".env"), "private"),
      writeFile(join(project, "src", "main.ts"), ""),
      writeFile(join(project, "src", "nested", "index.tsx"), ""),
      writeFile(join(project, "src", "utilities.ts"), ""),
      writeFile(join(project, "src", "_generated", "package.json"), ""),
      writeFile(join(fixture, "outside", "package.json"), "private"),
    ]);
    await symlink(
      join(fixture, "outside"),
      join(project, "src", "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
    const inspection = await inspectLocalProject(project, {
      readmeLines: 2,
      topEntriesLimit: 3,
    });
    expect(inspection).toEqual({
      name: "app",
      path: project,
      type: "JavaScript/TypeScript package",
      packageName: "fixture",
      packageManager: undefined,
      workspacePatterns: ["apps/*"],
      scripts: ["build"],
      git: { available: false },
      keyFolders: ["src", "src/main.ts", "src/nested", "src/utilities.ts"],
      notableFiles: [
        "package.json",
        "README.md",
        "src/main.ts",
        "src/nested/index.tsx",
        "src/utilities.ts",
      ],
      topEntries: ["package.json", "README.md", "src"],
      readmePreview: "Title\nSummary",
    });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

it("rejects cancellation and never follows a replaced approved workspace root", async () => {
  const fixture = await realpath(
    await mkdtemp(join(tmpdir(), "doolittle-project-inspect-")),
  );
  const project = join(fixture, "bound");
  const moved = join(fixture, "old");
  try {
    await mkdir(project);
    const controller = new AbortController();
    const cancelled = inspectLocalProject(project, {
      signal: controller.signal,
    });
    controller.abort(new Error("Turn cancelled."));
    await expect(cancelled).rejects.toThrow("Turn cancelled.");

    await runWithConversationWorkspace(
      { sessionId: "session", botId: "bot", workspacePath: project },
      async () => {
        await rename(project, moved);
        await symlink(
          moved,
          project,
          process.platform === "win32" ? "junction" : "dir",
        );
        await expect(inspectLocalProject(project)).rejects.toThrow(
          "The authorized workspace no longer resolves",
        );
      },
    );
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
