import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

function setup() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-deleted-overwrite-"));
  const workspace = new WorkspaceService(root);
  const context = { services: { workspace } } as AppContext;
  const save = (body: Record<string, unknown>) => {
    const url = new URL("http://localhost/workspace/write");
    return handleOperationsRoutes(
      context,
      new Request(url, { method: "POST", body: JSON.stringify(body) }),
      url,
    );
  };
  return { root, save };
}

it("lets only an explicit overwrite recreate a deleted file without weakening compare-and-swap", async () => {
  const { root, save } = setup();
  const path = join(root, "note.txt");
  try {
    writeFileSync(path, "opened version");
    rmSync(path);

    const plain = await save({
      path: "note.txt",
      expectedContent: "opened version",
      content: "user work",
    });
    expect(plain?.status).toBe(409);

    const recreated = await save({
      path: "note.txt",
      expectedContent: "opened version",
      content: "user work",
      overwrite: true,
    });
    expect(recreated?.status).toBe(200);
    expect(readFileSync(path, "utf8")).toBe("user work");

    writeFileSync(path, "agent version");
    const staleOverwrite = await save({
      path: "note.txt",
      expectedContent: "user work",
      content: "new user work",
      overwrite: true,
    });
    expect(staleOverwrite?.status).toBe(409);
    expect(readFileSync(path, "utf8")).toBe("agent version");

    const currentOverwrite = await save({
      path: "note.txt",
      expectedContent: "agent version",
      content: "new user work",
      overwrite: true,
    });
    expect(currentOverwrite?.status).toBe(200);
    expect(readFileSync(path, "utf8")).toBe("new user work");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("recreates a file deleted while an explicit overwrite waits for its checkpoint", async () => {
  const { root, save } = setup();
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
    const pending = save({
      path: "note.txt",
      expectedContent: "opened version",
      content: "user work",
      overwrite: true,
    });
    await started.promise;
    rmSync(path);
    checkpoint.resolve(receipt);

    const response = await pending;
    expect(response?.status).toBe(200);
    expect(readFileSync(path, "utf8")).toBe("user work");
  } finally {
    checkpoint.resolve(receipt);
    create.mockRestore();
    support.mockRestore();
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a non-boolean overwrite flag before touching the workspace", async () => {
  const { root, save } = setup();
  try {
    const response = await save({
      path: "note.txt",
      expectedContent: "",
      content: "user work",
      overwrite: "true",
    });
    expect(response?.status).toBe(400);
    expect(existsSync(join(root, "note.txt"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
