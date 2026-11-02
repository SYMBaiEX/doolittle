import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { copyRuntimeTrace } from "../../apps/desktop/scripts/sdk-runtime-packages";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-runtime-layout-"));
  roots.push(root);
  return root;
}
function put(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}
function loadArtifactPackage(output: string, name: string) {
  return createRequire(join(output, "entry.cjs"))(name);
}
it("keeps distinct dependency versions in their original Node resolution scopes", () => {
  const root = fixture();
  const out = join(root, "artifact");
  const files = {
    "node_modules/dep/index.js": "module.exports = 'root-version';",
    "node_modules/client/index.js": "module.exports = require('dep');",
    "node_modules/client/node_modules/dep/index.js":
      "module.exports = 'client-version';",
  };
  for (const [path, text] of Object.entries(files)) put(root, path, text);
  copyRuntimeTrace(root, out, Object.keys(files));
  expect(loadArtifactPackage(out, "dep")).toBe("root-version");
  expect(loadArtifactPackage(out, "client")).toBe("client-version");
  for (const [path, text] of Object.entries(files))
    expect(readFileSync(join(out, path), "utf8")).toBe(text);
});
it("preserves shared module identity through portable workspace links", () => {
  const root = fixture();
  const out = join(root, "artifact");
  put(
    root,
    "vendor/engine/index.js",
    "module.exports = { identity: Symbol('engine') };",
  );
  put(
    root,
    "node_modules/client/index.js",
    "module.exports = require('engine');",
  );
  mkdirSync(join(root, "node_modules/client/node_modules"), {
    recursive: true,
  });
  symlinkSync(
    join(root, "vendor/engine"),
    join(root, "node_modules/engine"),
    "dir",
  );
  symlinkSync(
    join(root, "vendor/engine"),
    join(root, "node_modules/client/node_modules/engine"),
    "dir",
  );
  copyRuntimeTrace(root, out, [
    "vendor/engine/index.js",
    "node_modules/client/index.js",
    "node_modules/engine",
    "node_modules/client/node_modules/engine",
  ]);
  expect(loadArtifactPackage(out, "engine")).toBe(
    loadArtifactPackage(out, "client"),
  );
});
it("rejects traced links that escape the dependency installation", () => {
  const root = fixture();
  const outside = fixture();
  put(outside, "private.js", "private");
  symlinkSync(join(outside, "private.js"), join(root, "escape.js"));
  expect(() =>
    copyRuntimeTrace(root, join(root, "artifact"), ["escape.js"]),
  ).toThrow("escaped its installation");
});

it("includes the original manifest when tracing a CJS entry below the package root", () => {
  const root = fixture();
  const out = join(root, "artifact");
  const manifest = JSON.stringify({
    name: "cjs-runtime",
    version: "1.0.0",
    main: "dist/entry.cjs",
  });
  put(root, "node_modules/cjs-runtime/package.json", manifest);
  put(
    root,
    "node_modules/cjs-runtime/dist/entry.cjs",
    "module.exports = 'native-package';",
  );
  const result = copyRuntimeTrace(root, out, [
    "node_modules/cjs-runtime/dist/entry.cjs",
  ]);
  expect(loadArtifactPackage(out, "cjs-runtime")).toBe("native-package");
  expect(
    readFileSync(join(out, "node_modules/cjs-runtime/package.json"), "utf8"),
  ).toBe(manifest);
  expect(result.files.has("node_modules/cjs-runtime/package.json")).toBe(true);
});
