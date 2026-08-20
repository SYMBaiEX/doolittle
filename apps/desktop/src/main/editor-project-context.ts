import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
// TypeScript 7's stable package does not expose the compiler API yet. Keep the
// isolated TypeScript 6 alias for editor project discovery until it does.
import ts from "typescript-legacy";
import type {
  EditorProjectCompilerOptions,
  EditorProjectContextRequest,
  EditorProjectContextResult,
} from "../shared/contracts";

const MAX_SUPPORT_FILES = 1_200;
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

interface PendingSupportFile {
  diskPath: string;
  virtualPath: string;
  virtualPackageRoot?: string;
}

interface ResolvedDependency {
  resolvedFileName?: string;
  originalPath?: string;
  packageId?: {
    name: string;
    subModuleName: string;
  };
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
    case ts.ModuleKind.Node16:
      return "node16";
    case ts.ModuleKind.NodeNext:
      return "nodenext";
    case ts.ModuleKind.Preserve:
      return "preserve";
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
      return "node";
    case ts.ModuleResolutionKind.Node16:
      return "node16";
    case ts.ModuleResolutionKind.NodeNext:
      return "nodenext";
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
  projectRoot: string,
): EditorProjectCompilerOptions {
  return {
    allowJs: compilerOptions.allowJs,
    allowSyntheticDefaultImports: compilerOptions.allowSyntheticDefaultImports,
    baseUrl:
      compilerOptions.baseUrl ??
      (compilerOptions.paths ? projectRoot : undefined),
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
  workspacePath: string,
): {
  supportFiles: EditorProjectContextResult["supportFiles"];
  packagePaths: Record<string, string[]>;
  truncated: boolean;
} {
  const seenVirtualPaths = new Set<string>();
  const pending: PendingSupportFile[] = [
    {
      diskPath: entryAbsolutePath,
      virtualPath: entryAbsolutePath,
    },
  ];
  const supportFiles: EditorProjectContextResult["supportFiles"] = [];
  const inMemoryContent = new Map<string, string>([
    [entryAbsolutePath, entryContent],
  ]);
  let pendingCursor = 0;
  let totalBytes = 0;
  let truncated = false;
  const packagePaths = new Map<string, string>();

  const enqueue = (
    diskCandidate: string | undefined,
    virtualCandidate?: string,
    virtualPackageRoot?: string,
  ) => {
    if (!diskCandidate) return;
    const diskPath = normalizePath(diskCandidate);
    const virtualPath = normalizePath(virtualCandidate ?? diskCandidate);
    if (seenVirtualPaths.has(virtualPath) || !existsSync(diskPath)) return;
    if (statSync(diskPath).isDirectory()) return;
    if (!isSourceLikeFile(diskPath)) return;
    pending.push({ diskPath, virtualPath, virtualPackageRoot });
  };

  const findVisiblePackageRoot = (packageName: string): string | undefined => {
    let directory = dirname(entryAbsolutePath);
    while (isInsideWorkspace(workspacePath, directory)) {
      const candidate = resolve(directory, "node_modules", packageName);
      if (existsSync(candidate)) return candidate;
      if (directory === workspacePath) return undefined;
      const parent = dirname(directory);
      if (parent === directory) return undefined;
      directory = parent;
    }
  };

  const enqueueResolved = (
    resolved: ResolvedDependency | undefined,
    importer?: PendingSupportFile,
    requestedModule?: string,
  ) => {
    if (!resolved?.resolvedFileName) return;
    const diskPath = normalizePath(resolved.resolvedFileName);
    const packageId = resolved.packageId;
    if (!packageId) {
      enqueue(diskPath, resolved.originalPath ?? diskPath);
      return;
    }

    const packagePathSegments = packageId.subModuleName
      .split("/")
      .filter(Boolean);
    const diskPackageRoot = resolve(
      diskPath,
      ...Array(packagePathSegments.length).fill(".."),
    );
    const virtualPackageRoot =
      findVisiblePackageRoot(packageId.name) ??
      (importer?.virtualPackageRoot
        ? resolve(importer.virtualPackageRoot, "node_modules", packageId.name)
        : undefined) ??
      (resolved.originalPath
        ? resolve(
            resolved.originalPath,
            ...Array(packagePathSegments.length).fill(".."),
          )
        : undefined);
    // Monaco's TypeScript worker only sees files registered as extra libs; it
    // cannot read the host workspace's package.json files. Modern packages use
    // `exports` (often with a `types` condition) to map public subpaths to their
    // declarations, so registering only the resolved .d.ts file still leaves
    // imports such as `@scope/ui/Button` unresolved inside the editor.
    if (virtualPackageRoot) {
      const virtualResolvedPath = resolve(
        virtualPackageRoot,
        packageId.subModuleName,
      );
      // Monaco's worker does not consistently expose package.json files to
      // the resolver through addExtraLib. An exact path mapping keeps package
      // `exports` subpaths resolvable even when the package has no physical
      // file at the import-shaped path (for example `@scope/ui/Button`).
      if (requestedModule && !packagePaths.has(requestedModule)) {
        // pnpm resolves declarations through its physical `.pnpm` store, but
        // the editor registers them at the logical node_modules path visible
        // to the workspace. Keep the path mapping in that same virtual
        // namespace or Monaco cannot find the extra library it just received.
        packagePaths.set(requestedModule, virtualResolvedPath);
      }
      enqueue(
        resolve(diskPackageRoot, "package.json"),
        resolve(virtualPackageRoot, "package.json"),
        virtualPackageRoot,
      );
    }
    enqueue(
      diskPath,
      virtualPackageRoot
        ? resolve(virtualPackageRoot, packageId.subModuleName)
        : (resolved.originalPath ?? diskPath),
      virtualPackageRoot,
    );
  };

  const drainPending = () => {
    // Walk breadth-first so every direct import is registered before a large
    // barrel (for example Heroicons) can spend the bounded transitive budget.
    while (pendingCursor < pending.length) {
      const current = pending[pendingCursor];
      pendingCursor += 1;
      if (!current) continue;
      const diskPath = normalizePath(current.diskPath);
      const virtualPath = normalizePath(current.virtualPath);
      if (seenVirtualPaths.has(virtualPath)) continue;
      seenVirtualPaths.add(virtualPath);

      const content =
        inMemoryContent.get(diskPath) ?? readFileSync(diskPath, "utf8");
      if (diskPath !== entryAbsolutePath) {
        const bytes = new TextEncoder().encode(content).byteLength;
        if (
          supportFiles.length >= MAX_SUPPORT_FILES ||
          totalBytes + bytes > MAX_SUPPORT_BYTES
        ) {
          truncated = true;
          continue;
        }
        supportFiles.push({
          path: virtualPath,
          content,
        });
        totalBytes += bytes;
      }

      const preprocessed = ts.preProcessFile(content, true, true);

      for (const reference of preprocessed.referencedFiles) {
        enqueue(
          resolve(dirname(diskPath), reference.fileName),
          resolve(dirname(virtualPath), reference.fileName),
          current.virtualPackageRoot,
        );
      }

      for (const directive of preprocessed.typeReferenceDirectives) {
        const resolved = ts.resolveTypeReferenceDirective(
          directive.fileName,
          diskPath,
          compilerOptions,
          TYPE_REFERENCE_HOST,
        ).resolvedTypeReferenceDirective;
        enqueueResolved(resolved, current, directive.fileName);
      }

      for (const imported of preprocessed.importedFiles) {
        const resolved = ts.resolveModuleName(
          imported.fileName,
          diskPath,
          compilerOptions,
          TYPE_REFERENCE_HOST,
        ).resolvedModule;
        if (
          resolved?.resolvedFileName &&
          (imported.fileName.startsWith(".") ||
            imported.fileName.startsWith("/"))
        ) {
          enqueue(
            resolved.resolvedFileName,
            resolve(
              dirname(virtualPath),
              relative(dirname(diskPath), resolved.resolvedFileName),
            ),
            current.virtualPackageRoot,
          );
        } else {
          enqueueResolved(resolved, current, imported.fileName);
        }
      }
    }
  };

  drainPending();

  const typeNames = Array.isArray(compilerOptions.types)
    ? compilerOptions.types
    : ts.getAutomaticTypeDirectiveNames(compilerOptions, TYPE_REFERENCE_HOST);
  for (const typeName of typeNames) {
    const resolved = ts.resolveTypeReferenceDirective(
      typeName,
      entryAbsolutePath,
      compilerOptions,
      TYPE_REFERENCE_HOST,
    ).resolvedTypeReferenceDirective;
    enqueueResolved(resolved, undefined, typeName);
  }

  if (
    compilerOptions.jsx === ts.JsxEmit.ReactJSX ||
    compilerOptions.jsx === ts.JsxEmit.ReactJSXDev
  ) {
    const runtime =
      compilerOptions.jsx === ts.JsxEmit.ReactJSXDev
        ? "react/jsx-dev-runtime"
        : "react/jsx-runtime";
    enqueueResolved(
      ts.resolveModuleName(
        runtime,
        entryAbsolutePath,
        compilerOptions,
        TYPE_REFERENCE_HOST,
      ).resolvedModule,
      undefined,
      runtime,
    );
  }

  drainPending();

  return {
    packagePaths: Object.fromEntries(
      [...packagePaths].map(([specifier, path]) => [specifier, [path]]),
    ),
    supportFiles,
    truncated,
  };
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
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        resolveJsonModule: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ES2022,
      };

  const entryContent =
    typeof request.content === "string"
      ? request.content
      : readFileSync(entryAbsolutePath, "utf8");
  const { packagePaths, supportFiles, truncated } = collectSupportFiles(
    entryAbsolutePath,
    entryContent,
    compilerOptions,
    workspacePath,
  );

  const normalizedCompilerOptions = normalizeCompilerOptions(
    compilerOptions,
    projectConfig ? dirname(projectConfig.path) : workspacePath,
  );
  const mergedPaths = {
    ...packagePaths,
    ...normalizedCompilerOptions.paths,
  };
  return {
    workspacePath,
    projectRoot: projectConfig ? dirname(projectConfig.path) : workspacePath,
    entryPath: entryAbsolutePath,
    tsconfigPath: projectConfig?.path,
    compilerOptions: {
      ...normalizedCompilerOptions,
      baseUrl:
        normalizedCompilerOptions.baseUrl ??
        (Object.keys(mergedPaths).length > 0 ? workspacePath : undefined),
      paths: Object.keys(mergedPaths).length > 0 ? mergedPaths : undefined,
    },
    supportFiles,
    truncated,
  };
}
