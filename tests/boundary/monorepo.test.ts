import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkMonorepo, importedModules } from "../../scripts/check-monorepo";
import { readWorkspaces } from "../../scripts/workspaces";

let root: string;
function write(path: string, value: unknown) {
  const target = resolve(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(
    target,
    typeof value === "string" ? value : JSON.stringify(value),
  );
}
function core(dependencies: Record<string, string> = {}) {
  write("packages/core/package.json", {
    name: "@fixture/core",
    version: "1.0.0",
    private: true,
    type: "module",
    exports: { "./chat": "./src/chat.ts" },
    dependencies,
  });
}
beforeEach(() => {
  root = mkdtempSync(resolve(tmpdir(), "doolittle-monorepo-"));
  write("package.json", {
    name: "fixture",
    version: "1.0.0",
    workspaces: ["apps/*", "packages/*", "packages/plugins/*"],
  });
  core();
  write("packages/core/src/chat.ts", "export const chat = true;");
  write("apps/cli/package.json", {
    name: "@fixture/cli",
    version: "1.0.0",
    private: true,
    type: "module",
    dependencies: { "@fixture/core": "workspace:*" },
  });
  write("apps/cli/src/index.ts", 'import { chat } from "@fixture/core/chat";');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("monorepo ownership", () => {
  it("accepts declared package exports and discovers nested provider workspaces", () => {
    write("packages/plugins/adapter/package.json", {
      name: "@fixture/adapter",
      version: "1.0.0",
      private: true,
      type: "module",
    });
    expect(
      readWorkspaces(root).map((workspace) => workspace.manifest.name),
    ).toEqual(["@fixture/cli", "@fixture/core", "@fixture/adapter"]);
    expect(checkMonorepo(root)).toEqual([]);
  });
  it("rejects circular dependencies and libraries depending on applications", () => {
    core({ "@fixture/cli": "workspace:*" });
    const failures = checkMonorepo(root).join("\n");
    expect(failures).toContain("shared packages cannot depend on applications");
    expect(failures).toContain("Workspace dependency cycle");
  });
  it("rejects cross-workspace relative imports, undeclared packages and private subpaths", () => {
    write(
      "apps/cli/src/index.ts",
      [
        'import "../../unused";',
        'import { chat } from "../../../packages/core/src/chat";',
        'import { hidden } from "@fixture/core/private";',
        'import { unknown } from "undeclared-package";',
      ].join("\n"),
    );
    const failures = checkMonorepo(root).join("\n");
    expect(failures).toContain("crossing workspace source paths");
    expect(failures).toContain("not a declared package export");
    expect(failures).toContain("undeclared dependency undeclared-package");
  });
  it("rejects missing exports, duplicate package identities and root source aliases", () => {
    write("apps/cli/src/index.ts", 'import { hidden } from "@/hidden";');
    write("packages/duplicate/package.json", {
      name: "@fixture/core",
      version: "1.0.0",
      type: "module",
      exports: { "./chat": "./missing.ts" },
    });
    const failures = checkMonorepo(root).join("\n");
    expect(failures).toContain("names must be unique");
    expect(failures).toContain("missing or invalid export target");
    expect(failures).toContain(
      "repo-wide aliases cannot bypass workspace ownership",
    );
  });
  it("parses static, dynamic, bare and type imports without reading quoted examples as code", () => {
    expect(
      importedModules(
        "sample.ts",
        [
          'import "side-effect-package";',
          'export { value } from "public-package";',
          'type Value = import("type-package").Value;',
          'const loaded = import("dynamic-package");',
          'const legacy = require("commonjs-package");',
          "const example = \"import { fake } from 'quoted-package'\";",
        ].join("\n"),
      ),
    ).toEqual([
      "side-effect-package",
      "public-package",
      "type-package",
      "dynamic-package",
      "commonjs-package",
    ]);
  });
});
