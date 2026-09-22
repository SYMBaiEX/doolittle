import { readFileSync } from "node:fs";
import { isBuiltin } from "node:module";
import { dirname, resolve } from "node:path";
import { build, type Metafile, type Plugin } from "esbuild";

export const SMITHERS_RUNTIME_ASSET = "doolittle-smithers.mjs";
const SUPPORTED_ORCHESTRATOR_VERSION = "2.0.3-beta.7";

/**
 * The SDK launches a generated Bun script. Its imports are inside a string,
 * so the desktop bundle cannot discover them, and import.meta.url no longer
 * identifies the original SDK package. Relocate only that dependency boundary;
 * the SDK still owns task execution, persistence, approvals, and ACP dispatch.
 * Fail closed on SDK drift instead of silently shipping an unpatched runner.
 */
export function relocateSmithersRunner(
  source: string,
  version: string,
): string {
  if (version !== SUPPORTED_ORCHESTRATOR_VERSION) {
    throw new Error(`Review Smithers desktop packaging for SDK ${version}.`);
  }
  const companionUrl = `\${JSON.stringify(new URL("./${SMITHERS_RUNTIME_ASSET}", import.meta.url).href)}`;
  const replacements = [
    [
      "import { Smithers } from 'smithers-orchestrator';",
      `import { Smithers } from ${companionUrl};`,
    ],
    [
      "import { Effect, Schema } from 'effect';",
      `import { Effect, Schema } from ${companionUrl};`,
    ],
    [
      '["-e", createTaskScript()]',
      '["--no-install", "-e", createTaskScript()]',
    ],
  ] as const;
  let relocated = source;
  for (const [original, replacement] of replacements) {
    if (relocated.split(original).length !== 2) {
      throw new Error(`SDK Smithers packaging boundary changed: ${original}`);
    }
    relocated = relocated.replace(original, replacement);
  }
  return relocated;
}

export const smithersBundlePaths: Plugin = {
  name: "smithers-bundle-paths",
  setup(esbuild) {
    let relocatedModules = 0;
    esbuild.onLoad(
      {
        filter:
          /@elizaos[\\/]plugin-agent-orchestrator[\\/]dist[\\/]node[\\/]index\.node\.js$/,
      },
      ({ path }) => {
        const manifest = JSON.parse(
          readFileSync(resolve(dirname(path), "../../package.json"), "utf8"),
        ) as { version: string };
        relocatedModules += 1;
        return {
          contents: relocateSmithersRunner(
            readFileSync(path, "utf8"),
            manifest.version,
          ),
          loader: "js",
        };
      },
    );
    esbuild.onEnd((result) => {
      if (result.errors.length === 0 && relocatedModules !== 1) {
        return {
          errors: [
            {
              text: "Packaged SDK task runner was not relocated exactly once.",
            },
          ],
        };
      }
      return undefined;
    });
  },
};

const smithersGraphDependency: Plugin = {
  name: "smithers-graph-dependency",
  setup(esbuild) {
    esbuild.onLoad(
      {
        filter:
          /@smithers-orchestrator[\\/]react-reconciler[\\/]src[\\/]core-peer\.js$/,
      },
      ({ path }) => {
        const manifest = JSON.parse(
          readFileSync(resolve(dirname(path), "../package.json"), "utf8"),
        ) as { version: string };
        const source = readFileSync(path, "utf8");
        const dynamicImport = "await importCoreModule(GRAPH_SPECIFIER)";
        if (
          manifest.version !== "0.22.0" ||
          source.split(dynamicImport).length !== 2
        ) {
          throw new Error(
            "Review Smithers graph peer dependency packaging after dependency changes.",
          );
        }
        // Make the pinned production peer visible to esbuild. The SDK's
        // source-monorepo fallback remains untouched but is not required.
        return {
          contents: source.replace(
            dynamicImport,
            'await import("@smithers-orchestrator/graph")',
          ),
          loader: "js",
        };
      },
    );
  },
};

/** Bundle the lockfile-resolved graph once, including one shared Effect copy. */
export async function bundleSmithersRuntime(
  repoRoot: string,
  outputDir: string,
): Promise<Metafile> {
  const result = await build({
    absWorkingDir: repoRoot,
    stdin: {
      contents:
        'export { Smithers } from "smithers-orchestrator"; export { Effect, Schema } from "effect";',
      resolveDir: repoRoot,
      sourcefile: "smithers-runtime-entry.js",
    },
    outfile: resolve(outputDir, SMITHERS_RUNTIME_ASSET),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "esnext",
    minify: true,
    sourcemap: false,
    legalComments: "none",
    metafile: true,
    // This companion is executed by the SDK's Bun child, never by Electron.
    external: ["bun", "bun:*"],
    plugins: [smithersGraphDependency],
    banner: {
      js: 'import { createRequire as __doolittleCreateRequire } from "node:module"; const require = __doolittleCreateRequire(import.meta.url);',
    },
    logLevel: "warning",
  });
  const unresolved = Object.values(result.metafile.outputs)
    .flatMap((output) => output.imports)
    .filter(
      ({ external, path }) =>
        external &&
        path !== "bun" &&
        !path.startsWith("bun:") &&
        !isBuiltin(path),
    );
  if (unresolved.length > 0) {
    throw new Error(
      `Smithers companion has unpackaged dependencies: ${unresolved.map(({ path }) => path).join(", ")}`,
    );
  }
  return result.metafile;
}
