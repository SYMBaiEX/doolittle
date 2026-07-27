import {
  chmodSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));
const outputDir = resolve(desktopRoot, "build", "runtime");
const generatedEntry = resolve(desktopRoot, "build", "runtime-entry.ts");

const TARGETS = {
  "darwin-arm64": "bun-darwin-arm64",
  "darwin-x64": "bun-darwin-x64",
  "linux-arm64": "bun-linux-arm64",
  "linux-x64": "bun-linux-x64-baseline",
  "win-arm64": "bun-windows-arm64",
  "win-x64": "bun-windows-x64-baseline",
} as const;

type RuntimeTarget = keyof typeof TARGETS;

function hostTarget(): RuntimeTarget {
  const platform = process.platform === "win32" ? "win" : process.platform;
  const candidate = `${platform}-${process.arch}` as RuntimeTarget;
  if (!(candidate in TARGETS)) {
    throw new Error(
      `Unsupported desktop runtime host: ${process.platform}-${process.arch}`,
    );
  }
  return candidate;
}

function requestedTarget(): RuntimeTarget {
  const argument = process.argv
    .slice(2)
    .find((value) => value.startsWith("--target="));
  const target = (argument?.slice("--target=".length) ||
    hostTarget()) as RuntimeTarget;
  if (!(target in TARGETS)) {
    throw new Error(
      `Unsupported runtime target "${target}". Expected one of: ${Object.keys(TARGETS).join(", ")}`,
    );
  }
  return target;
}

const target = requestedTarget();
const outputName = target.startsWith("win-")
  ? "doolittle-runtime.exe"
  : "doolittle-runtime";
const outputPath = resolve(outputDir, outputName);

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const pgliteDist = resolve(
  repoRoot,
  "node_modules",
  "@electric-sql",
  "pglite",
  "dist",
);
const embeddedPgliteAssets = readdirSync(pgliteDist)
  .filter(
    (fileName) =>
      fileName.endsWith(".tar.gz") ||
      fileName.endsWith(".wasm") ||
      fileName === "pglite.data",
  )
  .sort();
const assetImports = embeddedPgliteAssets
  .map(
    (fileName, index) =>
      `import embeddedPgliteAsset${index} from "../../../node_modules/@electric-sql/pglite/dist/${fileName}" with { type: "file" };`,
  )
  .join("\n");
const assetReferences = embeddedPgliteAssets
  .map((_, index) => `embeddedPgliteAsset${index}`)
  .join(", ");
writeFileSync(
  generatedEntry,
  `${assetImports}
const embeddedPgliteAssets = [${assetReferences}];
if (embeddedPgliteAssets.length === 0) {
  throw new Error("Doolittle Desktop runtime is missing PGlite assets.");
}
await import("../../../packages/agent/src/index.ts");
`,
  "utf8",
);

console.log(
  `Compiling the self-contained Doolittle runtime for ${target} (${TARGETS[target]}, ${embeddedPgliteAssets.length} embedded database assets)…`,
);
const pgliteCompiledAssetPlugin: Bun.BunPlugin = {
  name: "pglite-compiled-asset-paths",
  setup(build) {
    build.onLoad(
      {
        filter: /@electric-sql[\\/]pglite[\\/]dist[\\/]index\.js$/,
      },
      ({ path }) => {
        const source = readFileSync(path, "utf8");
        const marker = "if(!t.existsSync(e))throw new Error";
        if (!source.includes(marker)) {
          throw new Error(
            `PGlite compiled-asset loader marker changed in ${path}.`,
          );
        }
        return {
          contents: source.replace(
            marker,
            'if(typeof Bun<"u"){let r=Bun.file(e);if(await r.exists())return new Blob([Bun.gunzipSync(new Uint8Array(await r.arrayBuffer()))])}if(!t.existsSync(e))throw new Error',
          ),
          loader: "js",
        };
      },
    );
    build.onLoad(
      {
        filter:
          /@electric-sql[\\/]pglite[\\/]dist[\\/](?:vector[\\/]index|contrib[\\/]fuzzystrmatch)\.js$/,
      },
      ({ path }) => ({
        contents: readFileSync(path, "utf8")
          .replace("../vector.tar.gz", "./vector.tar.gz")
          .replace("../fuzzystrmatch.tar.gz", "./fuzzystrmatch.tar.gz"),
        loader: "js",
      }),
    );
  },
};
const result = await Bun.build({
  entrypoints: [generatedEntry],
  target: "bun",
  naming: { asset: "[name].[ext]" },
  plugins: [pgliteCompiledAssetPlugin],
  compile: {
    target: TARGETS[target],
    outfile: outputPath,
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
    ...(target.startsWith("win-")
      ? {
          windows: {
            hideConsole: true,
            title: "Doolittle Runtime",
            description: "Private runtime for Doolittle Desktop",
          },
        }
      : {}),
  },
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

if (!target.startsWith("win-")) {
  chmodSync(outputPath, 0o755);
}
writeFileSync(
  resolve(outputDir, "runtime-manifest.json"),
  `${JSON.stringify(
    {
      target,
      bunTarget: TARGETS[target],
      executable: outputName,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`Runtime ready: ${outputPath}`);
