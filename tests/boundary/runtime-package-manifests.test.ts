import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { installedDesktopProductionPackages } from "../../apps/desktop/scripts/desktop-artifact";

it("inventories dependencies whose public exports hide package manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-manifest-exports-"));
  try {
    const dependency = join(root, "node_modules/hidden-manifest");
    mkdirSync(join(dependency, "dist"), { recursive: true });
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({
        name: "client",
        version: "1.0.0",
        dependencies: { "hidden-manifest": "1.0.0" },
      }),
    );
    writeFileSync(
      join(dependency, "package.json"),
      JSON.stringify({
        name: "hidden-manifest",
        version: "1.0.0",
        exports: "./dist/index.cjs",
      }),
    );
    writeFileSync(join(dependency, "dist/index.cjs"), "module.exports = {};\n");
    expect(installedDesktopProductionPackages(root).inventory).toEqual([
      { name: "hidden-manifest", version: "1.0.0" },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
