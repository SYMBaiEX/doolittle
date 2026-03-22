#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface PublishArgs {
  provider: "codex" | "claude-code" | "all";
  dryRun: boolean;
  json: boolean;
  tag: string;
  otp?: string;
}

interface PublishResult {
  provider: "codex" | "claude-code";
  packageName: string;
  version: string;
  packagePath: string;
  cliSupportsPublish: boolean;
  recommendedFlow: "npm-publish" | "eliza-monorepo-release";
  dryRun: boolean;
  ok: boolean;
  command: string;
  detail: string;
  tag: string;
  output?: string;
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
      if (value === "codex" || value === "claude-code" || value === "all") {
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

function repoRoot() {
  return process.cwd();
}

function getProviders(
  provider: PublishArgs["provider"],
): Array<"codex" | "claude-code"> {
  return provider === "all" ? ["codex", "claude-code"] : [provider];
}

function providerPath(provider: "codex" | "claude-code"): string {
  return join(repoRoot(), "packages", "plugins", `plugin-${provider}`);
}

function readPackageManifest(path: string): { name: string; version: string } {
  const raw = readFileSync(join(path, "package.json"), "utf8");
  const parsed = JSON.parse(raw) as { name: string; version: string };
  return {
    name: parsed.name,
    version: parsed.version,
  };
}

function detectElizaCliPublishSupport(): boolean {
  const binPath = join(repoRoot(), "node_modules", ".bin", "elizaos");
  if (!existsSync(binPath)) {
    return false;
  }
  const result = spawnSync(binPath, ["--help"], {
    cwd: repoRoot(),
    encoding: "utf8",
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  return /\bpublish\b/i.test(output);
}

function hasOnlyStandaloneDependencies(targetPath: string): boolean {
  const raw = readFileSync(join(targetPath, "package.json"), "utf8");
  const manifest = JSON.parse(raw) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  const sections = [
    manifest.dependencies,
    manifest.peerDependencies,
    manifest.optionalDependencies,
  ];

  return sections.every((section) =>
    Object.values(section ?? {}).every(
      (version) =>
        typeof version !== "string" || !version.startsWith("workspace:"),
    ),
  );
}

function runNpmRelease(
  targetPath: string,
  dryRun: boolean,
  tag: string,
  otp?: string,
): { ok: boolean; command: string; output: string } {
  const args = dryRun
    ? ["pack", "--dry-run", targetPath]
    : ["publish", "--tag", tag];
  if (!dryRun && otp) {
    args.push("--otp", otp);
  }
  const result = spawnSync("npm", args, {
    cwd: dryRun ? repoRoot() : targetPath,
    encoding: "utf8",
    env: {
      ...process.env,
      npm_config_cache: join(repoRoot(), ".eliza-agent", ".npm-cache"),
    },
  });
  return {
    ok: result.status === 0,
    command: `npm ${args.join(" ")}`,
    output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
  };
}

async function main() {
  const args = parseArgs(Bun.argv.slice(2));
  const cliSupportsPublish = detectElizaCliPublishSupport();
  const results: PublishResult[] = [];

  for (const provider of getProviders(args.provider)) {
    const packagePath = providerPath(provider);
    const manifest = readPackageManifest(packagePath);
    const recommendedFlow: PublishResult["recommendedFlow"] =
      hasOnlyStandaloneDependencies(packagePath) && !cliSupportsPublish
        ? "npm-publish"
        : "eliza-monorepo-release";
    const run = runNpmRelease(packagePath, args.dryRun, args.tag, args.otp);

    results.push({
      provider,
      packageName: manifest.name,
      version: manifest.version,
      packagePath,
      cliSupportsPublish,
      recommendedFlow,
      dryRun: args.dryRun,
      ok: run.ok,
      command: run.command,
      detail:
        recommendedFlow === "npm-publish"
          ? "The local eliza repo uses monorepo release scripts around npm publishing, and these provider packages are already standalone-safe, so direct npm pack/publish is the correct release path here."
          : "This environment exposes broader monorepo publish support, so release orchestration should follow the main eliza workspace flow instead of standalone npm publish.",
      tag: args.tag,
      output: run.output || undefined,
    });
  }

  if (args.json) {
    console.log(JSON.stringify({ results }, null, 2));
    return;
  }

  for (const result of results) {
    console.log(
      [
        `[${result.provider}] ${result.packageName}@${result.version}`,
        `path=${result.packagePath}`,
        `cliSupportsPublish=${result.cliSupportsPublish}`,
        `recommendedFlow=${result.recommendedFlow}`,
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

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
