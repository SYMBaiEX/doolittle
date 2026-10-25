import { existsSync, readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import ts from "typescript-legacy";
import {
  readWorkspaces,
  type Workspace,
  type WorkspaceManifest,
} from "./workspaces";

const builtins = new Set(
  builtinModules.flatMap((name) => [name, `node:${name}`]),
);
const ignored = new Set([
  "node_modules",
  "dist",
  "build",
  "release",
  ".git",
  ".generated",
]);
function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name)) return [];
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(path)
      : /\.[cm]?[jt]sx?$/u.test(entry.name)
        ? [path]
        : [];
  });
}
export function workspaceDependencies(
  manifest: WorkspaceManifest,
): Record<string, string> {
  return {
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
    ...manifest.peerDependencies,
  };
}
export function workspaceCycles(workspaces: Workspace[]): string[] {
  const byName = new Map(
    workspaces.map((workspace) => [workspace.manifest.name, workspace]),
  );
  const visited = new Set<string>();
  const active: string[] = [];
  const cycles: string[] = [];
  function visit(name: string) {
    const position = active.indexOf(name);
    if (position >= 0) {
      cycles.push([...active.slice(position), name].join(" -> "));
      return;
    }
    if (visited.has(name)) return;
    const workspace = byName.get(name);
    if (!workspace) return;
    active.push(name);
    for (const dependency of Object.keys(
      workspaceDependencies(workspace.manifest),
    ))
      if (byName.has(dependency)) visit(dependency);
    active.pop();
    visited.add(name);
  }
  for (const name of byName.keys()) visit(name);
  return cycles;
}
function packageName(specifier: string): string {
  return specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
}
function exported(manifest: WorkspaceManifest, specifier: string): boolean {
  const subpath = specifier.slice(manifest.name.length);
  const key = subpath ? `.${subpath}` : ".";
  if (typeof manifest.exports === "string") return key === ".";
  return Object.keys(manifest.exports ?? {}).some((pattern) => {
    const star = pattern.indexOf("*");
    return star < 0
      ? pattern === key
      : key.startsWith(pattern.slice(0, star)) &&
          key.endsWith(pattern.slice(star + 1));
  });
}

/** Parse modules without mistaking generated code or quoted examples for imports. */
export function importedModules(file: string, text: string): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const modules = new Set<string>();
  function visit(node: ts.Node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      modules.add(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      modules.add(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      modules.add(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return [...modules];
}

export function checkMonorepo(root: string): string[] {
  const workspaces = readWorkspaces(root);
  const byName = new Map(
    workspaces.map((workspace) => [workspace.manifest.name, workspace]),
  );
  const failures: string[] = [];
  if (byName.size !== workspaces.length)
    failures.push("Workspace names must be unique.");
  const rootManifest = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  ) as WorkspaceManifest;
  const ordered = [...workspaces].sort(
    (a, b) => b.directory.length - a.directory.length,
  );
  const owner = (file: string) =>
    ordered.find((workspace) => {
      const path = relative(resolve(root, workspace.directory), file);
      return (
        !isAbsolute(path) &&
        path !== ".." &&
        !path.startsWith("../") &&
        !path.startsWith("..\\")
      );
    });
  for (const workspace of workspaces) {
    const { manifest, directory } = workspace;
    if (!/^(?:apps|packages)\//u.test(directory))
      failures.push(
        `${directory}: workspace belongs under apps/ or packages/.`,
      );
    if (manifest.type !== "module")
      failures.push(`${directory}: declare type=module.`);
    for (const [name, version] of Object.entries(
      workspaceDependencies(manifest),
    )) {
      const dependency = byName.get(name);
      if (!dependency) continue;
      if (
        directory.startsWith("packages/") &&
        dependency.directory.startsWith("apps/")
      )
        failures.push(
          `${directory}: shared packages cannot depend on applications (${name}).`,
        );
      if (
        !version.startsWith("workspace:") &&
        !(manifest.private !== true && version === dependency.manifest.version)
      )
        failures.push(
          `${directory}: use workspace: for local dependency ${name}; published providers may pin its release version.`,
        );
    }
    function validateExports(value: unknown) {
      if (
        typeof value === "string" &&
        !value.includes("*") &&
        (!value.startsWith("./") ||
          !existsSync(resolve(root, directory, value)))
      )
        failures.push(
          `${directory}: missing or invalid export target ${value}.`,
        );
      else if (value && typeof value === "object")
        for (const nested of Object.values(value)) validateExports(nested);
    }
    validateExports(manifest.exports);
  }
  failures.push(
    ...workspaceCycles(workspaces).map(
      (cycle) => `Workspace dependency cycle: ${cycle}`,
    ),
  );
  const files = [
    ...sourceFiles(resolve(root, "apps")),
    ...sourceFiles(resolve(root, "packages")),
    ...sourceFiles(resolve(root, "scripts")),
    ...sourceFiles(resolve(root, "tests")),
  ];
  for (const file of files) {
    const workspace = owner(file);
    const manifest = workspace?.manifest ?? rootManifest;
    const dependencies = workspaceDependencies(manifest);
    const label = relative(root, file);
    const text = readFileSync(file, "utf8");
    for (const specifier of importedModules(file, text)) {
      if (specifier.startsWith(".")) {
        const target = owner(resolve(dirname(file), specifier));
        if (workspace && target && target !== workspace)
          failures.push(
            `${label}: use ${target.manifest.name} exports instead of crossing workspace source paths (${specifier}).`,
          );
        continue;
      }
      if (builtins.has(specifier)) continue;
      if (/^(?:@\/|@plugins\/|@characters\/)/u.test(specifier)) {
        failures.push(
          `${label}: repo-wide aliases cannot bypass workspace ownership (${specifier}).`,
        );
        continue;
      }
      const name = packageName(specifier);
      if (name !== manifest.name && !Object.hasOwn(dependencies, name))
        failures.push(`${label}: undeclared dependency ${name}.`);
      const target = byName.get(name);
      if (target && !exported(target.manifest, specifier))
        failures.push(
          `${label}: ${specifier} is not a declared package export.`,
        );
    }
  }
  return [...new Set(failures)];
}
if (import.meta.main) {
  const failures = checkMonorepo(process.cwd());
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exitCode = 1;
  } else
    console.log(
      "Monorepo ownership, exports, dependency declarations and acyclic graph passed.",
    );
}
