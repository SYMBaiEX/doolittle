import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveEditorProjectContext } from "./editor-project-context";

function createWorkspace(): string {
  const workspace = mkdtempSync(
    join(process.cwd(), ".tmp-editor-project-context-"),
  );
  mkdirSync(join(workspace, "src", "main"), { recursive: true });
  mkdirSync(join(workspace, "src", "shared"), { recursive: true });
  writeFileSync(
    join(workspace, "tsconfig.main.json"),
    JSON.stringify(
      {
        compilerOptions: {
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          target: "ES2022",
          types: ["node"],
        },
        include: ["src/main/**/*.ts", "src/shared/**/*.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(workspace, "src", "main", "backend.ts"),
    [
      'import { readFileSync } from "node:fs";',
      'import { parseBackendUrl } from "./backend-url";',
      'import type { BackendState } from "../shared/contracts";',
      "",
      "export function boot(state: BackendState) {",
      "  return readFileSync(parseBackendUrl(state.url), 'utf8');",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(workspace, "src", "main", "backend-url.ts"),
    [
      "export function parseBackendUrl(url: string): string {",
      "  return url;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    join(workspace, "src", "shared", "contracts.ts"),
    ["export interface BackendState {", "  url: string;", "}", ""].join("\n"),
  );
  writeFileSync(
    join(workspace, "src", "main", "scratch.ts"),
    "export const scratch = true;\n",
  );
  return workspace;
}

describe("resolveEditorProjectContext", () => {
  it("uses the nearest matching tsconfig and loads support files for real module resolution", () => {
    const workspace = createWorkspace();
    try {
      const context = resolveEditorProjectContext({
        workspacePath: workspace,
        entryPath: "src/main/backend.ts",
      });

      expect(context.tsconfigPath).toBe(
        resolve(workspace, "tsconfig.main.json"),
      );
      expect(context.compilerOptions.moduleResolution).toBe("bundler");
      expect(context.supportFiles.map((file) => file.path)).toEqual(
        expect.arrayContaining([
          resolve(workspace, "src/main/backend-url.ts"),
          resolve(workspace, "src/shared/contracts.ts"),
        ]),
      );
      expect(
        context.supportFiles.some((file) => file.path.includes("@types/node")),
      ).toBe(true);
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("resolves imports added in the unsaved buffer content", () => {
    const workspace = createWorkspace();
    try {
      const context = resolveEditorProjectContext({
        workspacePath: workspace,
        entryPath: "src/main/backend.ts",
        content: [
          'import { readFileSync } from "node:fs";',
          'import { parseBackendUrl } from "./backend-url";',
          'import { scratch } from "./scratch";',
          'import type { BackendState } from "../shared/contracts";',
          "",
          "export function boot(state: BackendState) {",
          "  return scratch ? readFileSync(parseBackendUrl(state.url), 'utf8') : '';",
          "}",
          "",
        ].join("\n"),
      });

      expect(context.supportFiles.map((file) => file.path)).toContain(
        resolve(workspace, "src/main/scratch.ts"),
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
