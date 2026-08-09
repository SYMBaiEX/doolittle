#!/usr/bin/env nub

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { buildSync } from "esbuild";

const require = createRequire(import.meta.url);

type Provider = "provider-transport" | "claude-code" | "devin";

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

interface PackedPackage {
  result: CommandResult;
  tarballPath?: string;
}

const PROVIDERS: readonly Provider[] = [
  "provider-transport",
  "claude-code",
  "devin",
];

const LOCAL_COMPATIBILITY_PACKAGE_PATHS = [
  "packages/app-training",
  "packages/cloud-shared",
  "packages/plugin-remote-manifest",
  "packages/plugin-worker-runtime",
  "packages/registry",
] as const;

const ISOLATED_CONSUMER_OVERRIDE_NAMES = ["protobufjs", "tar"] as const;

function parseArgs(argv: string[]): PublishArgs {
  let provider: PublishArgs["provider"] = "all";
  let dryRun = true;
  let json = false;
  let tag = "alpha";
  let otp: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    }
    if (arg === "--provider") {
      const value = argv[index + 1]?.trim().toLowerCase();
      if (!value || value.startsWith("--")) {
        throw new Error("--provider requires a provider name.");
      }
      if (
        !([...PROVIDERS, "all"] as const).includes(value as Provider | "all")
      ) {
        throw new Error(`Unknown provider: ${value}.`);
      }
      provider = value as PublishArgs["provider"];
      index += 1;
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
      if (!value || value.startsWith("--")) {
        throw new Error("--tag requires a dist-tag value.");
      }
      tag = value;
      index += 1;
      continue;
    }
    if (arg === "--otp") {
      const value = argv[index + 1]?.trim();
      if (!value || value.startsWith("--")) {
        throw new Error("--otp requires a one-time password.");
      }
      otp = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}.`);
  }

  return { provider, dryRun, json, tag, otp };
}

function repoRoot(): string {
  return process.cwd();
}

function getProviders(provider: PublishArgs["provider"]): Provider[] {
  return provider === "all" ? [...PROVIDERS] : [provider];
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
  const { NODE_OPTIONS: _nodeOptions, ...environment } = process.env;
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: {
      ...environment,
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
      join(dirname(require.resolve("typescript/package.json")), "bin", "tsc"),
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
  try {
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
  } catch (error) {
    rmSync(temporaryPath, { recursive: true, force: true });
    throw error;
  }
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

function packPackage(
  stagedPackagePath: string,
  temporaryPath: string,
): PackedPackage {
  const archivePath = join(temporaryPath, "archive");
  mkdirSync(archivePath, { recursive: true });
  const packed = run(
    "npm",
    ["pack", "--json", "--pack-destination", archivePath, stagedPackagePath],
    repoRoot(),
  );
  if (!packed.ok) {
    return { result: packed };
  }
  const archive = JSON.parse(packed.stdout) as Array<{ filename: string }>;
  const tarballPath = join(archivePath, archive[0]?.filename ?? "");
  if (!archive[0]?.filename || !existsSync(tarballPath)) {
    return {
      result: {
        ok: false,
        command: packed.command,
        output: "npm pack did not produce a tarball.",
        stdout: "",
      },
    };
  }
  assertPackedContents(tarballPath);

  return { result: packed, tarballPath };
}

function packSupportingTransport(): {
  temporaryPath: string;
  tarballPath: string;
} {
  const packagePath = providerPath("provider-transport");
  const manifest = readPackageManifest(packagePath);
  assertStandaloneDependencies(manifest);
  const staged = createStagingPackage(packagePath, manifest);
  try {
    const packed = packPackage(staged.packagePath, staged.temporaryPath);
    if (!packed.result.ok || !packed.tarballPath) {
      throw new Error(
        packed.result.output || "Provider transport could not be packed.",
      );
    }
    return {
      temporaryPath: staged.temporaryPath,
      tarballPath: packed.tarballPath,
    };
  } catch (error) {
    rmSync(staged.temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

function packLocalCompatibilityPackages(): {
  temporaryPath?: string;
  tarballPaths: string[];
} {
  const packagePaths = LOCAL_COMPATIBILITY_PACKAGE_PATHS.map((path) =>
    join(repoRoot(), path),
  ).filter((path) => existsSync(join(path, "package.json")));
  if (packagePaths.length === 0) {
    return { tarballPaths: [] };
  }

  const temporaryPath = mkdtempSync(
    join(tmpdir(), "doolittle-provider-compat-"),
  );
  try {
    const tarballPaths = packagePaths.map((packagePath, index) => {
      const archivePath = join(temporaryPath, String(index));
      mkdirSync(archivePath, { recursive: true });
      const packed = run(
        "npm",
        ["pack", "--json", "--pack-destination", archivePath, packagePath],
        repoRoot(),
      );
      if (!packed.ok) {
        throw new Error(packed.output || `Could not pack ${packagePath}.`);
      }
      const archive = JSON.parse(packed.stdout) as Array<{ filename: string }>;
      const filename = archive[0]?.filename;
      const tarballPath = filename ? join(archivePath, filename) : "";
      if (!tarballPath || !existsSync(tarballPath)) {
        throw new Error(
          `npm pack did not produce a tarball for ${packagePath}.`,
        );
      }
      return tarballPath;
    });
    return { temporaryPath, tarballPaths };
  } catch (error) {
    rmSync(temporaryPath, { recursive: true, force: true });
    throw error;
  }
}

function isolatedConsumerSecurityOverrides(): Record<string, string> {
  const rootManifestPath = join(repoRoot(), "package.json");
  if (!existsSync(rootManifestPath)) return {};
  const rootManifest = JSON.parse(readFileSync(rootManifestPath, "utf8")) as {
    overrides?: Record<string, unknown>;
  };
  return Object.fromEntries(
    ISOLATED_CONSUMER_OVERRIDE_NAMES.flatMap((name) => {
      const version = rootManifest.overrides?.[name];
      return typeof version === "string" ? [[name, version]] : [];
    }),
  );
}

function smokePackedConsumer(
  tarballPath: string,
  manifest: PackageManifest,
  localDependencyTarballs: readonly string[],
): CommandResult {
  const consumerPath = mkdtempSync(
    join(tmpdir(), "doolittle-provider-consumer-"),
  );
  try {
    const securityOverrides = isolatedConsumerSecurityOverrides();
    writeFileSync(
      join(consumerPath, "package.json"),
      `${JSON.stringify({
        private: true,
        type: "module",
        ...(Object.keys(securityOverrides).length > 0
          ? { overrides: securityOverrides }
          : {}),
      })}\n`,
      "utf8",
    );
    const installed = run(
      "npm",
      ["install", "--ignore-scripts", ...localDependencyTarballs, tarballPath],
      consumerPath,
    );
    if (!installed.ok) {
      return installed;
    }

    const audited = run(
      "npm",
      ["audit", "--audit-level", "critical", "--omit", "dev"],
      consumerPath,
    );
    if (!audited.ok) {
      return audited;
    }

    const imported = run(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import(${JSON.stringify(manifest.name)})`,
      ],
      consumerPath,
    );
    return {
      ok: imported.ok,
      command: `${installed.command} && ${audited.command} && ${imported.command}`,
      output: [installed.output, audited.output, imported.output]
        .filter(Boolean)
        .join("\n"),
      stdout: imported.stdout,
    };
  } finally {
    rmSync(consumerPath, { recursive: true, force: true });
  }
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

function successfulReleaseDetail(
  dryRun: boolean,
  usedCompatibilityPackages: boolean,
  usedSecurityOverrides: boolean,
): string {
  const supportConditions = [
    usedCompatibilityPackages
      ? "explicit local Eliza beta compatibility packages"
      : undefined,
    usedSecurityOverrides
      ? "Doolittle's audited transitive security overrides"
      : undefined,
  ].filter(Boolean);
  const supportDetail =
    supportConditions.length > 0
      ? ` with ${supportConditions.join(" and ")}`
      : "";
  return dryRun
    ? `Built dist JavaScript and declarations, then security-audited and imported the packed artifact${supportDetail} in an isolated consumer.`
    : `Built dist JavaScript and declarations, security-audited and imported the packed artifact${supportDetail} in an isolated consumer, then published it.`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const results: PublishResult[] = [];
  const stagedPackages: Array<{
    provider: Provider;
    manifest: PackageManifest;
    packagePath: string;
    temporaryPath: string;
    stagedPackagePath: string;
    tarballPath?: string;
  }> = [];

  for (const provider of getProviders(args.provider)) {
    const packagePath = providerPath(provider);
    let manifest: PackageManifest | undefined;
    let staged: { temporaryPath: string; packagePath: string } | undefined;
    try {
      manifest = readPackageManifest(packagePath);
      assertStandaloneDependencies(manifest);
      staged = createStagingPackage(packagePath, manifest);
      const packed = packPackage(staged.packagePath, staged.temporaryPath);
      if (!packed.result.ok || !packed.tarballPath) {
        throw new Error(
          packed.result.output || "Provider package could not be packed.",
        );
      }
      stagedPackages.push({
        provider,
        manifest,
        packagePath,
        temporaryPath: staged.temporaryPath,
        stagedPackagePath: staged.packagePath,
        tarballPath: packed.tarballPath,
      });
    } catch (error) {
      if (staged) {
        rmSync(staged.temporaryPath, { recursive: true, force: true });
      }
      results.push({
        provider,
        packageName: manifest?.name ?? "unknown",
        version: manifest?.version ?? "unknown",
        packagePath,
        dryRun: args.dryRun,
        ok: false,
        command: "build/pack/import",
        detail: error instanceof Error ? error.message : String(error),
        tag: args.tag,
        output: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const selectedTransportTarball = stagedPackages.find(
    ({ provider }) => provider === "provider-transport",
  )?.tarballPath;
  let supportingTransport: ReturnType<typeof packSupportingTransport> | null =
    null;
  let supportingTransportError: unknown;
  if (
    !selectedTransportTarball &&
    stagedPackages.some(({ provider }) => provider !== "provider-transport")
  ) {
    try {
      supportingTransport = packSupportingTransport();
    } catch (error) {
      supportingTransportError = error;
    }
  }
  const transportTarball =
    selectedTransportTarball ?? supportingTransport?.tarballPath;
  let compatibilityPackages: ReturnType<typeof packLocalCompatibilityPackages> =
    { tarballPaths: [] };
  try {
    if (supportingTransportError) {
      throw supportingTransportError;
    }
    compatibilityPackages = packLocalCompatibilityPackages();
    for (const staged of stagedPackages) {
      const localDependencies =
        staged.provider === "provider-transport" || !transportTarball
          ? compatibilityPackages.tarballPaths
          : [...compatibilityPackages.tarballPaths, transportTarball];
      try {
        const smoke = smokePackedConsumer(
          staged.tarballPath as string,
          staged.manifest,
          localDependencies,
        );
        const release =
          !args.dryRun && smoke.ok
            ? publishPackage(staged.stagedPackagePath, args.tag, args.otp)
            : smoke;
        results.push({
          provider: staged.provider,
          packageName: staged.manifest.name,
          version: staged.manifest.version,
          packagePath: staged.packagePath,
          dryRun: args.dryRun,
          ok: release.ok,
          command: release.command,
          detail: release.ok
            ? successfulReleaseDetail(
                args.dryRun,
                compatibilityPackages.tarballPaths.length > 0,
                Object.keys(isolatedConsumerSecurityOverrides()).length > 0,
              )
            : release.output ||
              "Provider package build, pack, or import smoke test failed.",
          tag: args.tag,
          output: release.output || undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          provider: staged.provider,
          packageName: staged.manifest.name,
          version: staged.manifest.version,
          packagePath: staged.packagePath,
          dryRun: args.dryRun,
          ok: false,
          command: "install/import",
          detail: message,
          tag: args.tag,
          output: message,
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const staged of stagedPackages) {
      results.push({
        provider: staged.provider,
        packageName: staged.manifest.name,
        version: staged.manifest.version,
        packagePath: staged.packagePath,
        dryRun: args.dryRun,
        ok: false,
        command: supportingTransportError
          ? "provider-transport-pack"
          : "compatibility-pack",
        detail: message,
        tag: args.tag,
        output: message,
      });
    }
  } finally {
    if (compatibilityPackages.temporaryPath) {
      rmSync(compatibilityPackages.temporaryPath, {
        recursive: true,
        force: true,
      });
    }
    if (supportingTransport) {
      rmSync(supportingTransport.temporaryPath, {
        recursive: true,
        force: true,
      });
    }
    for (const staged of stagedPackages) {
      rmSync(staged.temporaryPath, { recursive: true, force: true });
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
