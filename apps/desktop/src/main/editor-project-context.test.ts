import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
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

  it("registers package manifests required for exported package subpaths", () => {
    const workspace = mkdtempSync(
      join(process.cwd(), ".tmp-editor-package-exports-context-"),
    );
    const packageRoot = join(workspace, "node_modules", "@example", "ui");
    try {
      mkdirSync(join(workspace, "src"), { recursive: true });
      mkdirSync(join(packageRoot, "dist", "Button"), { recursive: true });
      writeFileSync(
        join(workspace, "src", "component.tsx"),
        [
          'import { Button } from "@example/ui/Button";',
          'export const component = <Button label="Save" />;',
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(packageRoot, "package.json"),
        JSON.stringify({
          name: "@example/ui",
          version: "1.0.0",
          type: "module",
          exports: {
            "./Button": {
              types: "./dist/Button/index.d.ts",
              default: "./dist/Button/index.js",
            },
          },
        }),
      );
      writeFileSync(
        join(packageRoot, "dist", "Button", "index.d.ts"),
        "export declare function Button(props: { label: string }): unknown;\n",
      );

      const context = resolveEditorProjectContext({
        workspacePath: workspace,
        entryPath: "src/component.tsx",
      });
      const paths = context.supportFiles.map((file) => file.path);

      expect(paths).toEqual(
        expect.arrayContaining([
          resolve(packageRoot, "package.json"),
          resolve(packageRoot, "dist/Button/index.d.ts"),
        ]),
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });

  it("registers pnpm dependencies at the logical paths Monaco resolves", () => {
    const workspace = mkdtempSync(
      join(process.cwd(), ".tmp-editor-pnpm-context-"),
    );
    const reactStore = join(
      workspace,
      "node_modules",
      ".pnpm",
      "@types+react@1.0.0",
      "node_modules",
      "@types",
      "react",
    );
    const cssStore = join(
      workspace,
      "node_modules",
      ".pnpm",
      "csstype@1.0.0",
      "node_modules",
      "csstype",
    );
    const directoryLinkType = process.platform === "win32" ? "junction" : "dir";
    try {
      mkdirSync(join(workspace, "src"), { recursive: true });
      mkdirSync(reactStore, { recursive: true });
      mkdirSync(cssStore, { recursive: true });
      mkdirSync(join(workspace, "node_modules", "@types"), {
        recursive: true,
      });
      writeFileSync(
        join(workspace, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            jsx: "react-jsx",
            module: "ESNext",
            moduleResolution: "Bundler",
            paths: { "@/*": ["./src/*"] },
          },
          include: ["src/**/*.ts"],
        }),
      );
      writeFileSync(
        join(workspace, "src", "component.ts"),
        [
          'import type * as React from "react";',
          "export const component: React.FC = () => null;",
          "",
        ].join("\n"),
      );
      writeFileSync(
        join(reactStore, "package.json"),
        JSON.stringify({
          name: "@types/react",
          version: "1.0.0",
          types: "index.d.ts",
        }),
      );
      writeFileSync(
        join(reactStore, "index.d.ts"),
        [
          '/// <reference path="./global.d.ts" />',
          'import type * as CSS from "csstype";',
          "export type FC = () => unknown;",
          "export type Style = CSS.Properties;",
          "",
        ].join("\n"),
      );
      writeFileSync(join(reactStore, "global.d.ts"), "interface Element {}\n");
      writeFileSync(
        join(cssStore, "package.json"),
        JSON.stringify({
          name: "csstype",
          version: "1.0.0",
          types: "index.d.ts",
        }),
      );
      writeFileSync(
        join(cssStore, "index.d.ts"),
        "export interface Properties { color?: string }\n",
      );
      symlinkSync(
        reactStore,
        join(workspace, "node_modules", "@types", "react"),
        directoryLinkType,
      );
      symlinkSync(
        cssStore,
        join(
          workspace,
          "node_modules",
          ".pnpm",
          "@types+react@1.0.0",
          "node_modules",
          "csstype",
        ),
        directoryLinkType,
      );

      const context = resolveEditorProjectContext({
        workspacePath: workspace,
        entryPath: "src/component.ts",
      });
      const paths = context.supportFiles.map((file) => file.path);

      expect(context.compilerOptions.baseUrl).toBe(workspace);
      expect(context.compilerOptions.moduleResolution).toBe("bundler");
      expect(paths).toEqual(
        expect.arrayContaining([
          resolve(workspace, "node_modules/@types/react/index.d.ts"),
          resolve(workspace, "node_modules/@types/react/global.d.ts"),
          resolve(
            workspace,
            "node_modules/@types/react/node_modules/csstype/index.d.ts",
          ),
        ]),
      );
      expect(paths.some((path) => path.includes("node_modules/.pnpm"))).toBe(
        false,
      );
    } finally {
      rmSync(workspace, { force: true, recursive: true });
    }
  });
});
