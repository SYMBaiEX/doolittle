import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  createJobControl,
  requestJobCancel,
} from "../../apps/cli/src/cli/jobs/control";
import {
  jobPaths,
  jobsRoot,
} from "../../apps/cli/src/cli/jobs/store/index-store";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-job-capability-"));
  roots.push(root);
  const id = randomUUID();
  const paths = jobPaths(root, id);
  for (const path of [jobsRoot(root), paths.root, paths.stateDir])
    mkdirSync(path, { mode: 0o700 });
  return { root, id, paths };
}
it("preserves the first job owner and publishes repeatable cancellation without leftover staging files", () => {
  const { root, id, paths } = fixture();
  const nonce = createJobControl(root, id);
  const saved = readFileSync(paths.controlPath, "utf8");
  expect(() => createJobControl(root, id)).toThrow();
  expect(readFileSync(paths.controlPath, "utf8")).toBe(saved);
  expect(requestJobCancel(root, id)).toBe("requested");
  expect(requestJobCancel(root, id)).toBe("requested");
  expect(JSON.parse(readFileSync(paths.requestPath, "utf8"))).toEqual({
    id,
    nonce,
  });
  expect(readdirSync(paths.root).sort()).toEqual([
    "cancel-request.json",
    "control.json",
    "state",
  ]);
});
it("does not follow or replace an existing control symlink", () => {
  const { root, id, paths } = fixture();
  const target = join(root, "preserved");
  writeFileSync(target, "private original");
  symlinkSync(target, paths.controlPath);
  expect(() => createJobControl(root, id)).toThrow();
  expect(readFileSync(target, "utf8")).toBe("private original");
  expect(requestJobCancel(root, id)).toBe("cannot-request");
});
