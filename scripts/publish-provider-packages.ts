#!/usr/bin/env bun

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface PublishArgs {
  provider: "codex" | "claude-code" | "all";
  dryRun: boolean;
  json: boolean;
}

interface PublishResult {
  provider: "codex" | "claude-code";
  packageName: string;
  version: string;
  packagePath: string;
  cliSupportsPublish: boolean;
  dryRun: boolean;
  ok: boolean;
  command: string;
  detail: string;
  output?: string;
}

function parseArgs(argv: string[]): PublishArgs {
  let provider: PublishArgs["provider"] = "all";
  let dryRun = true;
  let json = false;

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
    }
  }

  return { provider, dryRun, json };
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

function runNpmPack(
  targetPath: string,
  dryRun: boolean,
): { ok: boolean; command: string; output: string } {
  const args = ["pack"];
  if (dryRun) {
    args.push("--dry-run");
  }
  args.push(targetPath);
  const result = spawnSync("npm", args, {
    cwd: repoRoot(),
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
    const run = runNpmPack(packagePath, args.dryRun);

    results.push({
      provider,
      packageName: manifest.name,
      version: manifest.version,
      packagePath,
      cliSupportsPublish,
      dryRun: args.dryRun,
      ok: run.ok,
      command: run.command,
      detail: cliSupportsPublish
        ? "elizaos CLI publish support was detected locally."
        : "Local elizaos CLI does not expose a publish command on alpha.85, so npm pack/publish remains the correct provider package path here.",
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
        `dryRun=${result.dryRun}`,
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
