import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleOperationsRoutes } from "../../packages/agent/src/server/routes/operations";
import { WorkspaceService } from "../../packages/agent/src/services/workspace-service";
import {
  type WorkspaceCheckpoint,
  WorkspaceCheckpointService,
} from "../../packages/agent/src/services/workspace-service/checkpoints";
import { createDeferred } from "../support/deferred";

it("keeps a newer file written while an editor save waits for its checkpoint", async () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-conditional-write-"));
  const path = join(root, "note.txt");
  const started = createDeferred<void>();
  const checkpoint = createDeferred<WorkspaceCheckpoint>();
  const receipt = {
    id: "fixture",
    createdAt: "",
    label: "Before workspace write",
    revision: "fixture",
  };
  const support = vi
    .spyOn(WorkspaceCheckpointService.prototype, "support")
    .mockResolvedValue({ supported: true });
  const create = vi
    .spyOn(WorkspaceCheckpointService.prototype, "create")
    .mockImplementation(() => {
      started.resolve();
      return checkpoint.promise;
    });

  try {
    writeFileSync(path, "opened version");
    const workspace = new WorkspaceService(root);
    const context = { services: { workspace } } as AppContext;
    const url = new URL("http://localhost/workspace/write");
    const save = (expectedContent: string, content: string) =>
      handleOperationsRoutes(
        context,
        new Request(url, {
          method: "POST",
          body: JSON.stringify({ path: "note.txt", expectedContent, content }),
        }),
        url,
      );

    const pendingSave = save("opened version", "editor change");
    await Promise.race([
      started.promise,
      pendingSave.then(() => {
        throw new Error("The save finished before reaching the checkpoint.");
      }),
    ]);
    writeFileSync(path, "newer version!");
    checkpoint.resolve(receipt);

    const conflict = await pendingSave;
    expect(conflict?.status).toBe(409);
    expect(await conflict?.json()).toMatchObject({ conflict: true });
    expect(readFileSync(path, "utf8")).toBe("newer version!");

    expect((await save("opened version", "editor change"))?.status).toBe(409);
    expect(create).toHaveBeenCalledTimes(1);

    const saved = await save("newer version!", "short");
    expect(saved?.status).toBe(200);
    expect(await saved?.json()).toEqual({ path });
    expect(readFileSync(path, "utf8")).toBe("short");
    expect(create).toHaveBeenCalledTimes(2);

    await workspace.write("nested/legacy.txt", "unconditional");
    expect(readFileSync(join(root, "nested/legacy.txt"), "utf8")).toBe(
      "unconditional",
    );
  } finally {
    checkpoint.resolve(receipt);
    create.mockRestore();
    support.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});
