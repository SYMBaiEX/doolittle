#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

type Provider =
  | "provider-transport"
  | "codex"
  | "claude-code"
  | "devin"
  | "elizacloud";

interface PublishArgs {
  provider: Provider | "all";
  dryRun: boolean;
  json: boolean;
  tag: string;
  otp?: string;
}

interface PublishResult {
  provider: Provider;
  packageName: string;
  version: string;
  packagePath: string;
  dryRun: boolean;
  ok: boolean;
  command: string;
  detail: string;
  tag: string;
  output?: string;
}

interface PackageManifest extends Record<string, unknown> {
  name: string;
  version: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface CommandResult {
  ok: boolean;
  command: string;
  output: string;
  stdout: string;
}

function parseArgs(argv: string[]): PublishArgs {
  let provider: PublishArgs["provider"] = "all";
  let dryRun = true;
  let json = false;
  let tag = "alpha";
  let otp: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--provider") {
      const value = argv[index + 1]?.trim().toLowerCase();
      if (
        value === "provider-transport" ||
        value === "codex" ||
        value === "claude-code" ||
        value === "devin" ||
        value === "elizacloud" ||
        value === "all"
      ) {
        provider = value;
        index += 1;
      }
      continue;
    }
    if (arg === "--publish") {
      dryRun = false;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--tag") {
      const value = argv[index + 1]?.trim();
      if (value) {
        tag = value;
        index += 1;
      }
      continue;
    }
    if (arg === "--otp") {
      const value = argv[index + 1]?.trim();
      if (value) {
        otp = value;
        index += 1;
      }
    }
  }

  return { provider, dryRun, json, tag, otp };
}

function repoRoot(): string {
  return process.cwd();
}

function getProviders(provider: PublishArgs["provider"]): Provider[] {
  return provider === "all"
    ? ["provider-transport", "codex", "claude-code", "devin", "elizacloud"]
    : [provider];
}

function providerPath(provider: Provider): string {
  return join(
    repoRoot(),
    "packages",
    "plugins",
    provider === "provider-transport" ? provider : `plugin-${provider}`,
  );
}

function readPackageManifest(path: string): PackageManifest {
  return JSON.parse(
    readFileSync(join(path, "package.json"), "utf8"),
  ) as PackageManifest;
}

function run(command: string, args: string[], cwd: string): CommandResult {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(repoRoot(), ".doolittle", ".npm-cache"),
    },
  });
  const output = [result.stdout, result.stderr]
    .filter(Boolean)
    .join("\n")
    .trim();
  return {
    ok: result.status === 0,
    command: `${basename(command)} ${args.join(" ")}`,
    output,
    stdout: result.stdout?.trim() ?? "",
  };
}

function buildPackage(
  sourcePackagePath: string,
  stagedPackagePath: string,
): void {
  const sourcePath = join(sourcePackagePath, "src");
  const outputPath = join(stagedPackagePath, "dist");
  const entryPoint = join(sourcePath, "index.ts");

  rmSync(outputPath, { recursive: true, force: true });

  buildSync({
    bundle: true,
    entryPoints: [entryPoint],
    format: "esm",
    outdir: outputPath,
    packages: "external",
    platform: "node",
    target: "node24",
    logLevel: "silent",
  });

  const declaration = run(
    process.execPath,
    [
      require.resolve("typescript/bin/tsc"),
      "--declaration",
      "--emitDeclarationOnly",
      "--outDir",
      outputPath,
      "--rootDir",
      sourcePath,
      "--module",
      "ESNext",
      "--moduleResolution",
      "Bundler",
      "--target",
      "ES2022",
      "--strict",
      "--skipLibCheck",
      "--esModuleInterop",
      "--allowSyntheticDefaultImports",
      "--types",
      "node",
      "--typeRoots",
      dirname(dirname(require.resolve("@types/node/package.json"))),
      entryPoint,
    ],
    sourcePackagePath,
  );
  if (!declaration.ok) {
    throw new Error(`Declaration build failed: ${declaration.output}`);
  }

  for (const filename of ["index.js", "index.d.ts"]) {
    if (!existsSync(join(outputPath, filename))) {
      throw new Error(`Build did not create dist/${filename}.`);
    }
  }
}

function assertStandaloneDependencies(manifest: PackageManifest): void {
  for (const [section, dependencies] of Object.entries({
    dependencies: manifest.dependencies,
    optionalDependencies: manifest.optionalDependencies,
    peerDependencies: manifest.peerDependencies,
  })) {
    for (const [name, version] of Object.entries(dependencies ?? {})) {
      if (version.startsWith("workspace:")) {
        throw new Error(
          `${manifest.name} cannot be published standalone: ${section}.${name} uses ${version}.`,
        );
      }
    }
  }
}

function createStagingPackage(
  targetPath: string,
  manifest: PackageManifest,
): { temporaryPath: string; packagePath: string } {
  const temporaryRoot = join(repoRoot(), ".doolittle");
  mkdirSync(temporaryRoot, { recursive: true });
  const temporaryPath = mkdtempSync(join(temporaryRoot, "provider-publish-"));
  const packagePath = join(temporaryPath, "package");
  mkdirSync(packagePath, { recursive: true });

  const readmePath = join(targetPath, "README.md");
  if (existsSync(readmePath)) {
    writeFileSync(join(packagePath, "README.md"), readFileSync(readmePath));
  }
  const licensePath = join(repoRoot(), "LICENSE");
  if (existsSync(licensePath)) {
    writeFileSync(join(packagePath, "LICENSE"), readFileSync(licensePath));
  }
  const publishManifest: PackageManifest = {
    ...manifest,
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    exports: {
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    },
    files: ["dist", "README.md"],
  };
  writeFileSync(
    join(packagePath, "package.json"),
    `${JSON.stringify(publishManifest, null, 2)}\n`,
    "utf8",
  );
  buildPackage(targetPath, packagePath);
  return { temporaryPath, packagePath };
}

function assertPackedContents(tarballPath: string): void {
  const result = run("tar", ["-tzf", tarballPath], repoRoot());
  if (!result.ok) {
    throw new Error(`Could not inspect packed artifact: ${result.output}`);
  }
  const unexpected = result.output
    .split("\n")
    .filter(Boolean)
    .filter(
      (entry) =>
        entry !== "package/package.json" &&
        entry !== "package/README.md" &&
        !entry.startsWith("package/dist/") &&
        !/^package\/(?:LICENSE|NOTICE|COPYING)/i.test(entry),
    );
  if (unexpected.length > 0) {
    throw new Error(
      `Packed artifact includes unexpected files: ${unexpected.join(", ")}`,
    );
  }
}

function packAndSmokeTest(
  stagedPackagePath: string,
  temporaryPath: string,
  manifest: PackageManifest,
): CommandResult {
  const archivePath = join(temporaryPath, "archive");
  mkdirSync(archivePath, { recursive: true });
  const packed = run(
    "npm",
    ["pack", "--json", "--pack-destination", archivePath, stagedPackagePath],
    repoRoot(),
  );
  if (!packed.ok) {
    return packed;
  }
  const archive = JSON.parse(packed.stdout) as Array<{ filename: string }>;
  const tarballPath = join(archivePath, archive[0]?.filename ?? "");
  if (!archive[0]?.filename || !existsSync(tarballPath)) {
    return {
      ok: false,
      command: packed.command,
      output: "npm pack did not produce a tarball.",
      stdout: "",
    };
  }
  assertPackedContents(tarballPath);

  const unpackedPath = join(temporaryPath, "unpacked");
  mkdirSync(unpackedPath, { recursive: true });
  const extracted = run(
    "tar",
    ["-xzf", tarballPath, "-C", unpackedPath],
    repoRoot(),
  );
  if (!extracted.ok) {
    return extracted;
  }
  const packagePath = join(
    unpackedPath,
    "node_modules",
    ...manifest.name.split("/"),
  );
  mkdirSync(join(packagePath, ".."), { recursive: true });
  renameSync(join(unpackedPath, "package"), packagePath);
  const imported = run(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import(${JSON.stringify(manifest.name)})`,
    ],
    unpackedPath,
  );
  return {
    ok: imported.ok,
    command: `${packed.command} && ${imported.command}`,
    output: [packed.output, imported.output].filter(Boolean).join("\n"),
    stdout: imported.stdout,
  };
}

function publishPackage(
  targetPath: string,
  tag: string,
  otp?: string,
): CommandResult {
  const args = ["publish", "--tag", tag];
  if (otp) {
    args.push("--otp", otp);
  }
  return run("npm", args, targetPath);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results: PublishResult[] = [];

  for (const provider of getProviders(args.provider)) {
    const packagePath = providerPath(provider);
    const manifest = readPackageManifest(packagePath);
    try {
      assertStandaloneDependencies(manifest);
      const staged = createStagingPackage(packagePath, manifest);
      let release: CommandResult;
      try {
        const smoke = packAndSmokeTest(
          staged.packagePath,
          staged.temporaryPath,
          manifest,
        );
        release =
          !args.dryRun && smoke.ok
            ? publishPackage(staged.packagePath, args.tag, args.otp)
            : smoke;
      } finally {
        rmSync(staged.temporaryPath, { recursive: true, force: true });
      }
      results.push({
        provider,
        packageName: manifest.name,
        version: manifest.version,
        packagePath,
        dryRun: args.dryRun,
        ok: release.ok,
        command: release.command,
        detail: release.ok
          ? args.dryRun
            ? "Built dist JavaScript and declarations, then imported the packed artifact."
            : "Built dist JavaScript and declarations, imported the packed artifact, then published it."
          : release.output ||
            "Provider package build, pack, or import smoke test failed.",
        tag: args.tag,
        output: release.output || undefined,
      });
    } catch (error) {
      results.push({
        provider,
        packageName: manifest.name,
        version: manifest.version,
        packagePath,
        dryRun: args.dryRun,
        ok: false,
        command: "build/pack/import",
        detail: error instanceof Error ? error.message : String(error),
        tag: args.tag,
      });
    }
  }

  if (args.json) {
    console.log(JSON.stringify({ results }, null, 2));
  } else {
    for (const result of results) {
      console.log(
        [
          `[${result.provider}] ${result.packageName}@${result.version}`,
          `path=${result.packagePath}`,
          `dryRun=${result.dryRun}`,
          `tag=${result.tag}`,
          `ok=${result.ok}`,
          `command=${result.command}`,
          `detail=${result.detail}`,
          result.output ? `output=${result.output}` : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      console.log("");
    }
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
