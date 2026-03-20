#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");

const directories = [
  ".eliza-agent",
  ".eliza-agent/cron-output",
  ".eliza-agent/gateway",
  ".eliza-agent/hooks",
  ".eliza-agent/remote-artifacts",
  ".eliza-agent/trajectories",
  "packages/skills/generated",
];

function ensureDir(path: string): void {
  if (existsSync(path)) {
    return;
  }
  if (checkOnly) {
    return;
  }
  mkdirSync(path, { recursive: true });
}

function ensureEnvFile(): string[] {
  const messages: string[] = [];
  const envPath = join(root, ".env");
  const envExamplePath = join(root, ".env.example");

  if (existsSync(envPath)) {
    messages.push(".env already exists");
    return messages;
  }

  if (!existsSync(envExamplePath)) {
    messages.push(".env.example is missing");
    return messages;
  }

  if (checkOnly) {
    messages.push(".env would be created from .env.example");
    return messages;
  }

  writeFileSync(envPath, readFileSync(envExamplePath, "utf8"), "utf8");
  messages.push(".env created from .env.example");
  return messages;
}

const createdDirs: string[] = [];
for (const dir of directories) {
  const absolute = join(root, dir);
  const existed = existsSync(absolute);
  ensureDir(absolute);
  if (existed) {
    createdDirs.push(`${dir} (exists)`);
  } else if (checkOnly) {
    createdDirs.push(`${dir} (missing)`);
  } else {
    createdDirs.push(dir);
  }
}

const envMessages = ensureEnvFile();

const summary = [
  "Eliza Agent bootstrap",
  checkOnly ? "mode: check" : "mode: apply",
  "",
  "Directories:",
  ...createdDirs.map((entry) => `- ${entry}`),
  "",
  "Environment:",
  ...envMessages.map((entry) => `- ${entry}`),
  "",
  checkOnly
    ? "Bootstrap check complete."
    : "Bootstrap complete. Review .env, then run bun run dev or bun run start.",
];

console.log(summary.join("\n"));
