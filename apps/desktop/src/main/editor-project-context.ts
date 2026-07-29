import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import ts from "typescript";
import type {
  EditorProjectCompilerOptions,
  EditorProjectContextRequest,
  EditorProjectContextResult,
} from "../shared/contracts";

const MAX_SUPPORT_FILES = 400;
const MAX_SUPPORT_BYTES = 6_000_000;
const PROJECT_CONFIG_PATTERN = /^(?:tsconfig(?:\.[^.]+)?|jsconfig)\.json$/u;
const TYPE_REFERENCE_HOST: ts.ModuleResolutionHost = {
  directoryExists: ts.sys.directoryExists,
  fileExists: ts.sys.fileExists,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getDirectories: ts.sys.getDirectories,
  readFile: ts.sys.readFile,
  realpath: ts.sys.realpath,
  useCaseSensitiveFileNames: ts.sys.useCaseSensitiveFileNames,
};

interface ProjectConfigCandidate {
  path: string;
  options: ts.CompilerOptions;
}

function validateWorkspaceRelativePath(path: string): string {
  if (!path || path !== path.trim()) {
    throw new Error("A workspace-relative editor path is required.");
  }
  if (
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[A-Za-z]:/u.test(path) ||
    path.includes("\\")
  ) {
    throw new Error("Editor path must remain workspace-relative.");
  }
  if (
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Editor path contains unsafe traversal tokens.");
  }
  return path;
}

function validateWorkspacePath(path: string): string {
  if (!path || path !== path.trim()) {
    throw new Error("A workspace path is required.");
  }
  return resolve(path);
}

function isInsideWorkspace(
  workspacePath: string,
  absolutePath: string,
): boolean {
  const relation = relative(workspacePath, absolutePath);
  return (
    relation === "" ||
    (!relation.startsWith("..") && !relation.startsWith("../"))
  );
}

function isSourceLikeFile(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return (
    extension === ".ts" ||
    extension === ".tsx" ||
    extension === ".js" ||
    extension === ".jsx" ||
    extension === ".mts" ||
    extension === ".cts" ||
    extension === ".mjs" ||
    extension === ".cjs" ||
    extension === ".d.ts" ||
    extension === ".json"
  );
}

function normalizePath(path: string): string {
  return resolve(path);
}

function moduleKindName(
  value: ts.ModuleKind | undefined,
): EditorProjectCompilerOptions["module"] {
  switch (value) {
    case ts.ModuleKind.CommonJS:
      return "commonjs";
    case ts.ModuleKind.AMD:
      return "amd";
    case ts.ModuleKind.UMD:
      return "umd";
    case ts.ModuleKind.System:
      return "system";
    case ts.ModuleKind.ES2015:
      return "es2015";
    case ts.ModuleKind.ESNext:
      return "esnext";
    default:
      return undefined;
  }
}

function moduleResolutionName(
  value: ts.ModuleResolutionKind | undefined,
): EditorProjectCompilerOptions["moduleResolution"] {
  switch (value) {
    case ts.ModuleResolutionKind.Classic:
      return "classic";
    case ts.ModuleResolutionKind.Bundler:
      return "bundler";
    case ts.ModuleResolutionKind.Node10:
    case ts.ModuleResolutionKind.Node16:
    case ts.ModuleResolutionKind.NodeNext:
      return "node";
    default:
      return undefined;
  }
}

function jsxName(
  value: ts.JsxEmit | undefined,
): EditorProjectCompilerOptions["jsx"] {
  switch (value) {
    case ts.JsxEmit.None:
      return "none";
    case ts.JsxEmit.Preserve:
      return "preserve";
    case ts.JsxEmit.React:
      return "react";
    case ts.JsxEmit.ReactNative:
      return "react-native";
    case ts.JsxEmit.ReactJSX:
      return "react-jsx";
    case ts.JsxEmit.ReactJSXDev:
      return "react-jsxdev";
    default:
      return undefined;
  }
}

function targetName(
  value: ts.ScriptTarget | undefined,
): EditorProjectCompilerOptions["target"] {
  switch (value) {
    case ts.ScriptTarget.ES3:
      return "es3";
    case ts.ScriptTarget.ES5:
      return "es5";
    case ts.ScriptTarget.ES2015:
      return "es2015";
    case ts.ScriptTarget.ES2016:
      return "es2016";
    case ts.ScriptTarget.ES2017:
      return "es2017";
    case ts.ScriptTarget.ES2018:
      return "es2018";
    case ts.ScriptTarget.ES2019:
      return "es2019";
    case ts.ScriptTarget.ES2020:
      return "es2020";
    case ts.ScriptTarget.ES2022:
      return "es2022";
    case ts.ScriptTarget.ESNext:
      return "esnext";
    default:
      return undefined;
  }
}

function normalizeCompilerOptions(
  compilerOptions: ts.CompilerOptions,
): EditorProjectCompilerOptions {
  return {
    allowJs: compilerOptions.allowJs,
    allowSyntheticDefaultImports: compilerOptions.allowSyntheticDefaultImports,
    baseUrl: compilerOptions.baseUrl,
    esModuleInterop: compilerOptions.esModuleInterop,
    jsx: jsxName(compilerOptions.jsx),
    lib: compilerOptions.lib,
    module: moduleKindName(compilerOptions.module),
    moduleResolution: moduleResolutionName(compilerOptions.moduleResolution),
    paths: compilerOptions.paths,
    resolveJsonModule: compilerOptions.resolveJsonModule,
    skipLibCheck: compilerOptions.skipLibCheck,
    target: targetName(compilerOptions.target),
    types: compilerOptions.types,
  };
}

function findProjectConfig(
  entryAbsolutePath: string,
  workspacePath: string,
): ProjectConfigCandidate | null {
  let directory = dirname(entryAbsolutePath);
  const root = workspacePath;
  while (isInsideWorkspace(root, directory)) {
    const candidates = readdirSync(directory)
      .filter((name) => PROJECT_CONFIG_PATTERN.test(name))
      .sort((left, right) => {
        if (left === "tsconfig.json") return 1;
        if (right === "tsconfig.json") return -1;
        return left.localeCompare(right);
      });
    for (const candidate of candidates) {
      const path = resolve(directory, candidate);
      const parsed = ts.getParsedCommandLineOfConfigFile(
        path,
        {},
        {
          ...ts.sys,
          onUnRecoverableConfigFileDiagnostic: () => undefined,
        },
      );
      if (!parsed) continue;
      if (
        parsed.fileNames.some(
          (file) => normalizePath(file) === entryAbsolutePath,
        )
      ) {
        return { path, options: parsed.options };
      }
    }
    if (directory === root) break;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

function collectSupportFiles(
  entryAbsolutePath: string,
  entryContent: string,
  compilerOptions: ts.CompilerOptions,
): {
  supportFiles: EditorProjectContextResult["supportFiles"];
  truncated: boolean;
} {
  const seen = new Set<string>();
  const pending = [entryAbsolutePath];
  const supportFiles: EditorProjectContextResult["supportFiles"] = [];
  const inMemoryContent = new Map<string, string>([
    [entryAbsolutePath, entryContent],
  ]);
  let totalBytes = 0;
  let truncated = false;

  const enqueue = (candidate: string | undefined) => {
    if (!candidate) return;
    const normalized = normalizePath(candidate);
    if (seen.has(normalized) || !existsSync(normalized)) return;
    if (statSync(normalized).isDirectory()) return;
    if (!isSourceLikeFile(normalized)) return;
    pending.push(normalized);
  };

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) continue;
    const normalized = normalizePath(current);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const content =
      inMemoryContent.get(normalized) ?? readFileSync(normalized, "utf8");
    if (normalized !== entryAbsolutePath) {
      const bytes = new TextEncoder().encode(content).byteLength;
      if (
        supportFiles.length >= MAX_SUPPORT_FILES ||
        totalBytes + bytes > MAX_SUPPORT_BYTES
      ) {
        truncated = true;
        continue;
      }
      supportFiles.push({
        path: normalized,
        content,
      });
      totalBytes += bytes;
    }

    const preprocessed = ts.preProcessFile(content, true, true);

    for (const reference of preprocessed.referencedFiles) {
      enqueue(resolve(dirname(normalized), reference.fileName));
    }

    for (const directive of preprocessed.typeReferenceDirectives) {
      const resolved = ts.resolveTypeReferenceDirective(
        directive.fileName,
        normalized,
        compilerOptions,
        TYPE_REFERENCE_HOST,
      ).resolvedTypeReferenceDirective;
      enqueue(resolved?.resolvedFileName);
    }

    for (const imported of preprocessed.importedFiles) {
      const resolved = ts.resolveModuleName(
        imported.fileName,
        normalized,
        compilerOptions,
        TYPE_REFERENCE_HOST,
      ).resolvedModule;
      enqueue(resolved?.resolvedFileName);
    }
  }

  if (Array.isArray(compilerOptions.types)) {
    for (const typeName of compilerOptions.types) {
      const resolved = ts.resolveTypeReferenceDirective(
        typeName,
        entryAbsolutePath,
        compilerOptions,
        TYPE_REFERENCE_HOST,
      ).resolvedTypeReferenceDirective;
      if (!resolved?.resolvedFileName) continue;
      const normalized = normalizePath(resolved.resolvedFileName);
      if (seen.has(normalized)) continue;
      pending.push(normalized);
      while (pending.length > 0) {
        const next = pending.pop();
        if (!next) continue;
        const normalizedNext = normalizePath(next);
        if (seen.has(normalizedNext)) continue;
        seen.add(normalizedNext);
        const nextContent = readFileSync(normalizedNext, "utf8");
        const bytes = new TextEncoder().encode(nextContent).byteLength;
        if (
          supportFiles.length >= MAX_SUPPORT_FILES ||
          totalBytes + bytes > MAX_SUPPORT_BYTES
        ) {
          truncated = true;
          continue;
        }
        supportFiles.push({ path: normalizedNext, content: nextContent });
        totalBytes += bytes;
        const preprocessed = ts.preProcessFile(nextContent, true, true);
        for (const reference of preprocessed.referencedFiles) {
          enqueue(resolve(dirname(normalizedNext), reference.fileName));
        }
        for (const directive of preprocessed.typeReferenceDirectives) {
          const nested = ts.resolveTypeReferenceDirective(
            directive.fileName,
            normalizedNext,
            compilerOptions,
            TYPE_REFERENCE_HOST,
          ).resolvedTypeReferenceDirective;
          enqueue(nested?.resolvedFileName);
        }
        for (const imported of preprocessed.importedFiles) {
          const nested = ts.resolveModuleName(
            imported.fileName,
            normalizedNext,
            compilerOptions,
            TYPE_REFERENCE_HOST,
          ).resolvedModule;
          enqueue(nested?.resolvedFileName);
        }
      }
    }
  }

  return { supportFiles, truncated };
}

export function resolveEditorProjectContext(
  request: EditorProjectContextRequest,
): EditorProjectContextResult {
  const workspacePath = validateWorkspacePath(request.workspacePath);
  const entryPath = validateWorkspaceRelativePath(request.entryPath);
  const entryAbsolutePath = resolve(workspacePath, entryPath);
  if (!isInsideWorkspace(workspacePath, entryAbsolutePath)) {
    throw new Error("Editor path must remain inside the workspace.");
  }
  if (!existsSync(entryAbsolutePath)) {
    throw new Error("The requested editor file does not exist.");
  }

  const projectConfig = findProjectConfig(entryAbsolutePath, workspacePath);
  const compilerOptions: ts.CompilerOptions = projectConfig?.options
    ? {
        ...projectConfig.options,
        noEmit: true,
      }
    : {
        allowJs: true,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        resolveJsonModule: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
        types: ["node"],
      };

  const entryContent =
    typeof request.content === "string"
      ? request.content
      : readFileSync(entryAbsolutePath, "utf8");
  const { supportFiles, truncated } = collectSupportFiles(
    entryAbsolutePath,
    entryContent,
    compilerOptions,
  );

  return {
    workspacePath,
    projectRoot: projectConfig ? dirname(projectConfig.path) : workspacePath,
    entryPath: entryAbsolutePath,
    tsconfigPath: projectConfig?.path,
    compilerOptions: normalizeCompilerOptions(compilerOptions),
    supportFiles,
    truncated,
  };
}
