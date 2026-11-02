import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { nodeFileTrace, resolve as resolveDependency } from "@vercel/nft";
import { transformSync } from "esbuild";
import {
  type RuntimeDependencyLicenseSource,
  runtimePackageForSource,
  stableRuntimeDependencyInventory,
} from "./runtime-requirements";

// Keep module identity and import.meta.url intact across the SDK's process boundary.
export const SDK_RUNTIME_PACKAGES = [
  "@elizaos/core",
  "@elizaos/agent",
  "@elizaos/plugin-sql",
  "@elizaos/contracts",
  "@elizaos/host",
  "@elizaos/auth",
  "@elizaos/cloud-sdk",
  "@elizaos/plugin-assistant",
  "@elizaos/plugin-elizacloud",
  "@elizaos/plugin-agent-orchestrator",
] as const;

export async function copySdkRuntimePackages(
  repoRoot: string,
  outputDir: string,
  nativePackages: readonly string[],
) {
  const repoRequire = createRequire(resolve(repoRoot, "package.json"));
  const entries = SDK_RUNTIME_PACKAGES.filter(
    (name) => name !== "@elizaos/agent",
  ).map((name) =>
    createRequire(
      resolve(
        repoRoot,
        "vendor/elizaos/packages",
        name.slice("@elizaos/".length),
        "package.json",
      ),
    ).resolve(name),
  );
  const orchestratorRequire = createRequire(entries.at(-1) ?? "");
  entries.push(...nativePackages.map((name) => repoRequire.resolve(name)));
  // This import lives inside the SDK-generated Bun worker, beyond static JS tracing.
  entries.push(orchestratorRequire.resolve("smthrs"));
  // The SDK also invokes this published CJS package through createRequire.
  entries.push(orchestratorRequire.resolve("git-workspace-service"));
  const bundleEntries = [
    resolve(outputDir, "doolittle-runtime.mjs"),
    resolve(outputDir, "doolittle-acp.mjs"),
  ];
  entries.push(...bundleEntries);
  const traced = await nodeFileTrace(entries, {
    base: repoRoot,
    processCwd: dirname(
      orchestratorRequire.resolve(
        "@elizaos/plugin-agent-orchestrator/package.json",
      ),
    ),
    conditions: ["node", "production"],
    exportsOnly: true,
    fileIOConcurrency: 64,
    analysis: {
      emitGlobs: false,
      computeFileReferences: true,
      evaluatePureExpressions: true,
    },
    ignore: [
      "**/*.d.ts",
      "**/*.map",
      "**/*.test.*",
      "**/__tests__/**",
      "**/.env",
      "**/.env.*",
      "**/.npmrc",
      "**/auth.json",
      "**/vault.json",
      "**/.git-credentials",
      "**/.doolittle/**",
      "**/.eliza/**",
      "**/.eliza-agent/**",
      "var/**",
      "cache/**",
    ],
    async resolve(id, parent, job, isCjs) {
      if (id.startsWith("bun:") || id.startsWith("cloudflare:"))
        return "node:fs";
      const sdk = SDK_RUNTIME_PACKAGES.find(
        (name) => id === name || id.startsWith(`${name}/`),
      );
      if (sdk)
        return resolveDependency(
          id,
          resolve(
            repoRoot,
            "vendor/elizaos/packages",
            sdk.slice("@elizaos/".length),
            "package.json",
          ),
          job,
          isCjs,
        );
      // Analyze external imports against their original first-party owner.
      const owner = bundleEntries.includes(parent)
        ? resolve(repoRoot, "packages/agent/src/index.ts")
        : parent;
      return resolveDependency(id, owner, job, isCjs);
    },
    async readFile(path) {
      if (!existsSync(path)) return null;
      const source = readFileSync(path, "utf8");
      // Analyze TypeScript runtime packages; ship their original bytes for Bun.
      return /\.[cm]?tsx?$/u.test(path)
        ? transformSync(source, {
            loader: path.endsWith("tsx") ? "tsx" : "ts",
            format: "esm",
            target: "esnext",
          }).code
        : source;
    },
  });
  // Native wrappers can compute platform package names inside require(). Their
  // installed optional packages contain the addon and executable helper assets.
  for (const name of nativePackages) {
    const owner = runtimePackageForSource(
      repoRoot,
      relative(repoRoot, repoRequire.resolve(name)),
    );
    if (!owner) throw new Error(`Native package has no manifest: ${name}`);
    const manifest = JSON.parse(
      readFileSync(resolve(owner.directory, "package.json"), "utf8"),
    );
    const ownerRequire = createRequire(
      resolve(owner.directory, "package.json"),
    );
    for (const optional of Object.keys(manifest.optionalDependencies ?? {})) {
      let directory: string | undefined;
      try {
        directory = dirname(ownerRequire.resolve(`${optional}/package.json`));
      } catch {
        try {
          directory = runtimePackageForSource(
            repoRoot,
            relative(repoRoot, ownerRequire.resolve(optional)),
          )?.directory;
        } catch {
          continue;
        }
      }
      if (!directory) continue;
      const addAssets = (path: string) => {
        for (const entry of readdirSync(path)) {
          if (entry === "node_modules") continue;
          const asset = resolve(path, entry);
          if (lstatSync(asset).isDirectory()) addAssets(asset);
          else if (!asset.endsWith(".d.ts") && !asset.endsWith(".map"))
            traced.fileList.add(relative(repoRoot, asset));
        }
      };
      addAssets(directory);
    }
  }
  const { files, licenseSources } = copyRuntimeTrace(
    repoRoot,
    outputDir,
    traced.fileList,
    bundleEntries,
  );
  for (const name of SDK_RUNTIME_PACKAGES) {
    const target = resolve(
      outputDir,
      "vendor/elizaos/packages",
      name.slice("@elizaos/".length),
    );
    const destination = resolve(outputDir, "node_modules", name);
    if (!existsSync(resolve(target, "package.json")))
      throw new Error(`SDK trace omitted ${name}`);
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    symlinkSync(relative(dirname(destination), target), destination, "dir");
    files.add(relative(outputDir, destination));
  }
  console.log(
    `Copied ${files.size} traced SDK runtime files without source rewrites (${traced.warnings.size} conservative trace diagnostics).`,
  );
  return {
    files: [...files].sort((a, b) => a.localeCompare(b)),
    packages: stableRuntimeDependencyInventory(licenseSources),
    licenseSources,
  };
}

/** Copy original bytes and preserve Node's nested dependency and symlink identity. */
export function copyRuntimeTrace(
  repoRoot: string,
  outputDir: string,
  trace: Iterable<string>,
  bundleEntries: readonly string[] = [],
) {
  const base = realpathSync(repoRoot);
  const outputRoot = resolve(base, relative(repoRoot, outputDir));
  function packagedPath(source: string) {
    const path = relative(base, source);
    if (path.startsWith("..") || isAbsolute(path))
      throw new Error(`SDK runtime trace escaped its installation: ${source}`);
    return resolve(outputRoot, path);
  }
  const files = new Set<string>();
  const links: Array<{ source: string; destination: string }> = [];
  const packages = new Map<string, RuntimeDependencyLicenseSource>();
  for (const path of [...trace].sort()) {
    const source = resolve(base, path);
    if (lstatSync(source).isSymbolicLink()) {
      links.push({ source, destination: packagedPath(source) });
      continue;
    }
    const actual = realpathSync(source);
    const existingAsset = relative(outputRoot, actual);
    if (!existingAsset.startsWith("..") && !isAbsolute(existingAsset)) {
      if (!bundleEntries.includes(actual)) files.add(existingAsset);
      continue;
    }
    const destination = packagedPath(actual);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(actual, destination);
    files.add(relative(outputRoot, destination));
    const owner = runtimePackageForSource(base, relative(base, actual));
    if (owner) packages.set(`${owner.name}@${owner.version}`, owner);
  }
  for (const { source, destination } of links.sort(
    (a, b) => a.destination.length - b.destination.length,
  )) {
    const target = packagedPath(realpathSync(source));
    mkdirSync(dirname(target), { recursive: true });
    mkdirSync(dirname(destination), { recursive: true });
    rmSync(destination, { recursive: true, force: true });
    symlinkSync(
      relative(dirname(destination), target),
      destination,
      lstatSync(realpathSync(source)).isDirectory() ? "dir" : "file",
    );
    files.add(relative(outputRoot, destination));
  }
  return { files, licenseSources: [...packages.values()] };
}
