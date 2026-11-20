import {
  closeSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  readOptionalJson,
  readRegularFileDescriptorSync,
  readRegularFileSync,
} from "../../packages/storage/src/index";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-json-state-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
it("reads persistent state and treats only absent files as empty", () => {
  const root = fixture();
  expect(readOptionalJson(join(root, "missing.json"))).toBeNull();
  writeFileSync(join(root, "state.json"), '{"enabled":true}');
  expect(readOptionalJson(join(root, "state.json"))).toEqual({ enabled: true });
});
it("does not hide corrupt JSON or invalid filesystem structure as missing state", () => {
  const root = fixture();
  writeFileSync(join(root, "state.json"), "broken");
  expect(() => readOptionalJson(join(root, "state.json"))).toThrow();
  expect(() =>
    readOptionalJson(join(root, "state.json", "child.json")),
  ).toThrow();
  mkdirSync(join(root, "directory.json"));
  expect(() => readOptionalJson(join(root, "directory.json"))).toThrow();
});

it("bounds regular-file reads without changing caller-owned descriptor offsets", () => {
  const root = fixture();
  const path = join(root, "state");
  writeFileSync(path, "abc");
  const descriptor = openSync(path, "r");
  try {
    const byte = Buffer.alloc(1);
    readSync(descriptor, byte, 0, 1, null);
    expect(readRegularFileDescriptorSync(descriptor, 3).toString()).toBe("abc");
    readSync(descriptor, byte, 0, 1, null);
    expect(byte.toString()).toBe("b");
  } finally {
    closeSync(descriptor);
  }
  expect(() => readRegularFileSync(path, 2)).toThrow(
    expect.objectContaining({ code: "too_large" }),
  );
  linkSync(path, join(root, "linked"));
  expect(() => readRegularFileSync(path, 3, { singleLink: true })).toThrow(
    expect.objectContaining({ code: "not_regular" }),
  );
});
