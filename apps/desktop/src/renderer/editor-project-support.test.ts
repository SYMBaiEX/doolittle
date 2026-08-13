import { beforeEach, describe, expect, it, vi } from "vitest";
import { compilerOptionsForMonaco } from "./editor-project-compiler-options";
import { acquireMonacoProjectSupport } from "./editor-project-support";

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
    const options = compilerOptionsForMonaco({
      allowJs: false,
      baseUrl: "/workspace/apps/desktop",
      jsx: "react-jsx",
      module: "esnext",
      moduleResolution: "bundler",
      paths: {
        "@/*": ["../../packages/agent/src/*"],
      },
      target: "es2022",
      types: ["node", "vite/client"],
    });

    expect(options.allowJs).toBe(false);
    expect(options.baseUrl).toBe("/workspace/apps/desktop");
    expect(options.jsx).toBe(4);
    expect(options.module).toBe(99);
    expect(options.moduleResolution).toBe(100);
    expect(options.target).toBe(99);
    expect(options.types).toEqual(["node", "vite/client"]);
  });
});

describe("acquireMonacoProjectSupport", () => {
  it("configures Monaco through the registered TypeScript defaults and loads project declarations", () => {
    const release = acquireMonacoProjectSupport({
      workspacePath: "/workspace",
      projectRoot: "/workspace",
      entryPath: "/workspace/src/component.tsx",
      compilerOptions: {
        jsx: "react-jsx",
        moduleResolution: "bundler",
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
      truncated: false,
    });

    expect(languageDefaults.typescript.setCompilerOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        jsx: 4,
        moduleResolution: 100,
      }),
    );
    expect(languageDefaults.javascript.addExtraLib).toHaveBeenCalledWith(
      "export type FC = () => unknown;",
      "file:///workspace/node_modules/@types/react/index.d.ts",
    );
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

    const javascriptDisposable =
      languageDefaults.javascript.addExtraLib.mock.results[0]?.value;
    const typescriptDisposable =
      languageDefaults.typescript.addExtraLib.mock.results[0]?.value;
    release();
    expect(javascriptDisposable?.dispose).toHaveBeenCalledOnce();
    expect(typescriptDisposable?.dispose).toHaveBeenCalledOnce();
  });
});
