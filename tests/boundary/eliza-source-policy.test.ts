import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  readElizaSourceBuilds,
  type SourceBuild,
  sourceBuildMatches,
  sourceTreeDigest,
} from "../../scripts/eliza-source-policy";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-source-policy-"));
  roots.push(root);
  mkdirSync(join(root, "tooling/eliza-source"), { recursive: true });
  mkdirSync(join(root, "vendor/elizaos"), { recursive: true });
  const hash = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  const build: SourceBuild = {
    artifact: "vendor/elizaos/core.tgz",
    version: "2.0.3-beta.7",
    sha256: hash("archive bytes"),
    treeSha256: hash("source files"),
    repository: "https://github.com/elizaos/eliza",
    commit: "a".repeat(40),
    package: "packages/core",
    bun: "1.4.2",
    node: "26.5.0",
    nub: "0.9.7",
    toolLockSha256: hash("locked tools"),
  };
  writeFileSync(
    join(root, "tooling/eliza-source/source.json"),
    JSON.stringify({ ...build, packages: [build.package] }),
  );
  writeFileSync(join(root, "tooling/eliza-source/nub.lock"), "locked tools");
  writeFileSync(join(root, build.artifact), "archive bytes");
  const save = () =>
    writeFileSync(
      join(root, "vendor/elizaos/source-builds.json"),
      JSON.stringify({ "@elizaos/core": build }),
    );
  save();
  return { root, build, save };
}
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

it("accepts a qualified source archive and the exact installed build receipt", () => {
  const { root, build } = fixture();
  expect(readElizaSourceBuilds(root)["@elizaos/core"]).toEqual(build);
  expect(
    sourceBuildMatches(build, {
      version: build.version,
      doolittleSourceBuild: build,
    }),
  ).toBe(true);
  expect(sourceBuildMatches(build, { version: build.version })).toBe(false);
  expect(
    sourceBuildMatches(build, {
      version: build.version,
      doolittleSourceBuild: { ...build, commit: "b".repeat(40) },
    }),
  ).toBe(false);
});
it("rejects changed archive bytes even when the package version is unchanged", () => {
  const { root, build } = fixture();
  writeFileSync(join(root, build.artifact), "different implementation");
  expect(() => readElizaSourceBuilds(root)).toThrow("integrity mismatch");
});
it.each(["commit", "toolLockSha256", "package", "artifact"] as const)(
  "rejects an unreviewed %s",
  (key) => {
    const { root, build, save } = fixture();
    build[key] = "../unreviewed";
    save();
    expect(() => readElizaSourceBuilds(root)).toThrow("Unqualified");
  },
);

it("detects changed SDK implementation bytes while ignoring installed dependency links", () => {
  const { root } = fixture();
  const source = join(root, "sdk");
  mkdirSync(source);
  writeFileSync(join(source, "index.js"), "export const value = 1;\n");
  const original = sourceTreeDigest(source);
  mkdirSync(join(source, "node_modules"));
  writeFileSync(join(source, "node_modules", "peer.js"), "installed peer");
  expect(sourceTreeDigest(source)).toBe(original);
  writeFileSync(join(source, "index.js"), "export const value = 2;\n");
  expect(sourceTreeDigest(source)).not.toBe(original);
});
it("rejects linked implementation files outside a qualified source snapshot", () => {
  const { root } = fixture();
  const source = join(root, "sdk");
  mkdirSync(source);
  writeFileSync(join(root, "outside.js"), "export const injected = true;");
  symlinkSync(join(root, "outside.js"), join(source, "index.js"));
  expect(() => sourceTreeDigest(source)).toThrow(
    "Unsupported upstream source entry",
  );
});
