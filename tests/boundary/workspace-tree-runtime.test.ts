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
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { runWithConversationWorkspace } from "../../packages/agent/src/runtime/workspace-scope";
import { handleWorkspaceRoutes } from "../../packages/agent/src/server/routes/workspace";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";
import {
  listCompleteWorkspaceTreeAsync,
  listWorkspaceTree,
  listWorkspaceTreeAsync,
} from "../../packages/agent/src/services/workspace-service/tree";

it("continues a bounded workspace walk after yielding while respecting file visibility", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "doolittle-workspace-tree-"));
  try {
    await mkdir(join(workspace, "src"));
    await mkdir(join(workspace, "node_modules"));
    await Promise.all([
      writeFile(join(workspace, ".env"), ""),
      writeFile(join(workspace, ".env.example"), ""),
      writeFile(join(workspace, "node_modules", "ignored.js"), ""),
      ...Array.from({ length: 260 }, (_, index) =>
        writeFile(
          join(workspace, "src", `module-${String(index).padStart(3, "0")}.ts`),
          "",
        ),
      ),
    ]);

    const limited = await listWorkspaceTreeAsync(workspace, 1, 257);
    const full = await listCompleteWorkspaceTreeAsync(workspace, 1);
    expect(limited).toEqual({
      entries: full.entries.slice(0, 257),
      truncated: true,
    });
    expect(full.truncated).toBe(false);
    expect(full.entries).toHaveLength(262);
    expect(full.entries.slice(0, 2).map(({ path }) => path)).toEqual([
      ".env.example",
      "src",
    ]);
    expect(full.entries.at(-1)?.path).toBe("src/module-259.ts");
    expect(listWorkspaceTree(workspace, 1, 3)).toEqual(
      full.entries.slice(0, 3),
    );
    await expect(
      listWorkspaceTreeAsync(join(workspace, "missing"), 1),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("caps the summary and cancels an API tree read with its request", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "doolittle-workspace-tree-"));
  try {
    await mkdir(join(workspace, "docs"));
    await mkdir(join(workspace, "src"));
    await writeFile(join(workspace, ".env"), "hidden");
    await writeFile(join(workspace, "docs", "index.md"), "");
    await writeFile(join(workspace, "src", "index.ts"), "");
    const service = new WorkspaceService(workspace);
    expect(service.summary(2)).toBe("- docs/\n  - docs/index.md");
    expect(service.summary(0)).toBe("(empty workspace)");

    const treeAsync = vi.spyOn(service, "treeAsync");
    const context = {
      services: { workspace: service },
    } as unknown as AppContext;
    const controller = new AbortController();
    const url = new URL("http://localhost/workspace/tree?depth=12");
    const request = new Request(url, { signal: controller.signal });
    const result = handleWorkspaceRoutes(context, request, url);
    controller.abort(new Error("The UI moved to another project."));

    await expect(result).rejects.toThrow("The UI moved to another project.");
    expect(treeAsync).toHaveBeenCalledWith(12, undefined, request.signal);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

it("keeps scoped summaries and tree reads inside the approved canonical root", async () => {
  const parent = await realpath(
    await mkdtemp(join(tmpdir(), "doolittle-workspace-rebind-")),
  );
  try {
    const workspacePath = join(parent, "workspace");
    const alternate = join(parent, "alternate");
    await mkdir(workspacePath);
    await mkdir(alternate);
    await writeFile(join(alternate, "unrelated.ts"), "");

    const service = new WorkspaceService(workspacePath);
    await runWithConversationWorkspace(
      { sessionId: "fixture", botId: "fixture", workspacePath },
      async () => {
        await rename(workspacePath, join(parent, "original"));
        await symlink(alternate, workspacePath, "junction");
        expect(service.summary()).toBe("(empty workspace)");
        expect(await service.treeAsync()).toEqual({
          entries: [],
          truncated: false,
        });
      },
    );
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
