import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDesktopBuildInventory,
  type DesktopOutputBundle,
  validateDesktopBuildInventory,
} from "./desktop-build-inventory";

function packageModule(root: string, name: string, version: string): string {
  const directory = join(root, "node_modules", ...name.split("/"));
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name, version }),
  );
  const path = join(directory, "index.js");
  writeFileSync(path, "export {};\n");
  return path;
}

function bundle(root: string): DesktopOutputBundle {
  const plain = packageModule(root, "plain-package", "1.2.3");
  const scoped = packageModule(root, "@scope/emitted", "4.5.6");
  const shaken = packageModule(root, "shaken-package", "9.9.9");
  return {
    "entry.js": {
      type: "chunk",
      fileName: "entry.js",
      name: "entry",
      code: "console.log('ok');\n",
      dynamicImports: [],
      exports: [],
      facadeModuleId: null,
      implicitlyLoadedBefore: [],
      importedBindings: {},
      imports: [],
      isDynamicEntry: false,
      isEntry: true,
      isImplicitEntry: false,
      map: null,
      modules: {
        [plain]: {
          code: null,
          originalLength: 20,
          renderedExports: [],
          removedExports: [],
          renderedLength: 11,
        },
        [scoped]: {
          code: null,
          originalLength: 20,
          renderedExports: [],
          removedExports: [],
          renderedLength: 7,
        },
        [shaken]: {
          code: null,
          originalLength: 20,
          renderedExports: [],
          removedExports: [],
          renderedLength: 0,
        },
      },
      moduleIds: [plain, scoped, shaken],
      preliminaryFileName: "entry.js",
      referencedFiles: [],
      sourcemapFileName: null,
    },
    "empty.txt": {
      type: "asset",
      fileName: "empty.txt",
      name: "empty.txt",
      names: ["empty.txt"],
      originalFileName: null,
      originalFileNames: [],
      source: "",
      needsCodeReference: false,
    },
  } as unknown as DesktopOutputBundle;
}

describe("desktop emitted build inventory", () => {
  it("is stable and excludes zero-byte outputs and tree-shaken packages", () => {
    const root = mkdtempSync(join(tmpdir(), "desktop-inventory-"));
    const first = createDesktopBuildInventory("renderer", bundle(root));
    const second = createDesktopBuildInventory("renderer", bundle(root));
    expect(second).toEqual(first);
    expect(first.outputs.map((entry) => entry.path)).toEqual(["entry.js"]);
    expect(
      first.packages.map(({ name, version, renderedBytes }) => ({
        name,
        version,
        renderedBytes,
      })),
    ).toEqual([
      { name: "@scope/emitted", version: "4.5.6", renderedBytes: 7 },
      { name: "plain-package", version: "1.2.3", renderedBytes: 11 },
    ]);
  });

  it("rejects output tampering", () => {
    const root = mkdtempSync(join(tmpdir(), "desktop-inventory-"));
    const outputRoot = join(root, "dist");
    mkdirSync(outputRoot);
    const inventory = createDesktopBuildInventory("main", bundle(root));
    writeFileSync(join(outputRoot, "entry.js"), "console.log('ok');\n");
    expect(
      validateDesktopBuildInventory(inventory, "main", outputRoot),
    ).toEqual(inventory);
    writeFileSync(
      join(outputRoot, "entry.js"),
      `${readFileSync(join(outputRoot, "entry.js"), "utf8")}tampered`,
    );
    expect(() =>
      validateDesktopBuildInventory(inventory, "main", outputRoot),
    ).toThrow("tampered");
  });
});
