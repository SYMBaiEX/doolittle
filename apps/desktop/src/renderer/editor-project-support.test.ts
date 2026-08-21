import ts from "typescript-legacy";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { compilerOptionsForMonaco } from "./editor-project-compiler-options";
import {
  acquireMonacoProjectSupport,
  setMonacoProjectDiagnosticsPending,
} from "./editor-project-support";

const languageDefaults = vi.hoisted(() => {
  const create = () => ({
    addExtraLib: vi.fn(() => ({ dispose: vi.fn() })),
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn(),
    setEagerModelSync: vi.fn(),
  });
  return {
    javascript: create(),
    typescript: create(),
  };
});

vi.mock("monaco-editor", () => ({
  Uri: {
    file: (path: string) => ({
      toString: () => `file://${path}`,
    }),
  },
  typescript: {
    javascriptDefaults: languageDefaults.javascript,
    typescriptDefaults: languageDefaults.typescript,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("compilerOptionsForMonaco", () => {
  it("preserves modern project settings for Monaco's bundled TS worker", () => {
    const options = compilerOptionsForMonaco(
      {
        allowJs: false,
        baseUrl: "/workspace/apps/desktop",
        jsx: "react-jsx",
        module: "esnext",
        moduleResolution: "bundler",
        paths: {
          "@/*": ["../../packages/agent/src/*"],
          react: ["/workspace/node_modules/@types/react/index.d.ts"],
        },
        target: "es2022",
        types: ["node", "vite/client"],
      },
      (path) => `file://${path}`,
    );

    expect(options.allowJs).toBe(false);
    expect(options.baseUrl).toBe("file:///workspace/apps/desktop");
    expect(options.jsx).toBe(4);
    expect(options.module).toBe(99);
    expect(options.moduleResolution).toBe(100);
    expect(options.target).toBe(99);
    expect(options.paths).toEqual({
      "@/*": ["../../packages/agent/src/*"],
      react: ["file:///workspace/node_modules/@types/react/index.d.ts"],
    });
    expect(options.types).toEqual(["node", "vite/client"]);
  });

  it("resolves workspace aliases and packages inside Monaco's file URI namespace", () => {
    const entry = "file:///workspace/app/about/page.tsx";
    const aliasTarget = "file:///workspace/components/landing/LandingShell.tsx";
    const packageTarget =
      "file:///workspace/node_modules/motion/dist/react.d.ts";
    const files = new Set([entry, aliasTarget, packageTarget]);
    const options = compilerOptionsForMonaco(
      {
        baseUrl: "/workspace",
        module: "esnext",
        moduleResolution: "bundler",
        paths: {
          "@/*": ["./*"],
          "motion/react": ["/workspace/node_modules/motion/dist/react.d.ts"],
        },
      },
      (path) => `file://${path}`,
    ) as ts.CompilerOptions;
    const host: ts.ModuleResolutionHost = {
      directoryExists: () => true,
      fileExists: (path) => files.has(path),
      getCurrentDirectory: () => "",
      readFile: () => "",
      realpath: (path) => path,
    };

    expect(
      ts.resolveModuleName(
        "@/components/landing/LandingShell",
        entry,
        options,
        host,
      ).resolvedModule?.resolvedFileName,
    ).toBe(aliasTarget);
    expect(
      ts.resolveModuleName("motion/react", entry, options, host).resolvedModule
        ?.resolvedFileName,
    ).toBe(packageTarget);
  });
});

describe("acquireMonacoProjectSupport", () => {
  it("keeps syntax checks but defers semantic diagnostics until project support is ready", () => {
    setMonacoProjectDiagnosticsPending("typescript", true);

    expect(
      languageDefaults.typescript.setDiagnosticsOptions,
    ).toHaveBeenCalledWith({
      noSemanticValidation: true,
      noSuggestionDiagnostics: true,
      noSyntaxValidation: false,
      onlyVisible: false,
    });

    setMonacoProjectDiagnosticsPending("typescript", false);
    expect(
      languageDefaults.typescript.setDiagnosticsOptions,
    ).toHaveBeenLastCalledWith({
      noSemanticValidation: false,
      noSuggestionDiagnostics: false,
      noSyntaxValidation: false,
      onlyVisible: false,
    });
  });

  it("configures Monaco through the registered TypeScript defaults and loads project declarations", () => {
    const release = acquireMonacoProjectSupport(
      {
        workspacePath: "/workspace",
        projectRoot: "/workspace",
        entryPath: "/workspace/src/component.tsx",
        compilerOptions: {
          baseUrl: "/workspace",
          jsx: "react-jsx",
          moduleResolution: "bundler",
          paths: {
            "@/*": ["./*"],
            react: ["/workspace/node_modules/@types/react/index.d.ts"],
          },
        },
        supportFiles: [
          {
            path: "/workspace/node_modules/@types/react/index.d.ts",
            content: "export type FC = () => unknown;",
          },
          {
            path: "/workspace/node_modules/@example/ui/package.json",
            content:
              '{"exports":{"./Button":{"types":"./dist/Button/index.d.ts"}}}',
          },
        ],
        revision: "revision-1",
        supportBytes: 160,
        truncated: false,
      },
      "typescript",
    );

    expect(languageDefaults.typescript.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "file:///workspace",
        jsx: 4,
        moduleResolution: 100,
        paths: {
          "@/*": ["./*"],
          react: ["file:///workspace/node_modules/@types/react/index.d.ts"],
        },
      }),
    );
    expect(languageDefaults.javascript.addExtraLib).not.toHaveBeenCalled();
    expect(languageDefaults.typescript.addExtraLib).toHaveBeenCalledWith(
      "export type FC = () => unknown;",
      "file:///workspace/node_modules/@types/react/index.d.ts",
    );
    expect(languageDefaults.typescript.addExtraLib).toHaveBeenCalledWith(
      '{"exports":{"./Button":{"types":"./dist/Button/index.d.ts"}}}',
      "file:///workspace/node_modules/@example/ui/package.json",
    );
    expect(
      languageDefaults.typescript.addExtraLib.mock.invocationCallOrder[0],
    ).toBeLessThan(
      languageDefaults.typescript.setCompilerOptions.mock
        .invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );

    const typescriptDisposable =
      languageDefaults.typescript.addExtraLib.mock.results[0]?.value;
    release();
    expect(typescriptDisposable?.dispose).toHaveBeenCalledOnce();
  });

  it("registers JavaScript support only with the JavaScript worker", () => {
    const release = acquireMonacoProjectSupport(
      {
        workspacePath: "/workspace",
        projectRoot: "/workspace",
        entryPath: "/workspace/src/component.js",
        compilerOptions: { allowJs: true, moduleResolution: "bundler" },
        supportFiles: [
          {
            path: "/workspace/node_modules/example/index.d.ts",
            content: "export declare const value: string;",
          },
        ],
        revision: "revision-2",
        supportBytes: 43,
        truncated: false,
      },
      "javascript",
    );

    expect(languageDefaults.javascript.addExtraLib).toHaveBeenCalledOnce();
    expect(languageDefaults.typescript.addExtraLib).not.toHaveBeenCalled();
    expect(
      languageDefaults.javascript.setCompilerOptions,
    ).toHaveBeenCalledOnce();
    release();
  });
});
