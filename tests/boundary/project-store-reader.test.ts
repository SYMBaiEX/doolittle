import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { readStoredProject } from "../../packages/agent/src/services/session/projects/read";
import { ProjectStore } from "../../packages/agent/src/services/session/projects/store";
import { createSessionDatabase } from "../../packages/agent/src/services/session/service/support";

it("reads fresh committed projects without modifying the runtime database", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-project-read-"));
  const database = createSessionDatabase(root);
  const store = new ProjectStore(database);
  const digest = () =>
    createHash("sha256")
      .update(readFileSync(join(root, "state.db")))
      .digest("hex");
  try {
    store.create({ id: "project", name: "Original", primaryPath: root });
    const before = digest();
    expect(readStoredProject(root, "project")?.name).toBe("Original");
    expect(digest()).toBe(before);
    store.update("project", { name: "Updated" });
    expect(readStoredProject(root, "project")?.name).toBe("Updated");
    expect(readStoredProject(root, "missing")).toBeUndefined();
  } finally {
    database.close();
    rmSync(root, { recursive: true, force: true });
  }
});

it("never creates or repairs a missing or invalid database during native project reads", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-project-read-"));
  const path = join(root, "state.db");
  try {
    expect(() => readStoredProject(root, "project")).toThrow();
    expect(existsSync(path)).toBe(false);
    writeFileSync(path, "invalid database");
    expect(() => readStoredProject(root, "project")).toThrow();
    expect(readFileSync(path, "utf8")).toBe("invalid database");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
