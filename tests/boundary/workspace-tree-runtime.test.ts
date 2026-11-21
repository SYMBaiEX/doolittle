import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import {
  listCompleteWorkspaceTreeAsync,
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
    await expect(
      listWorkspaceTreeAsync(join(workspace, "missing"), 1),
    ).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
