#!/usr/bin/env bun

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PLUGINS_ROOT = join(ROOT, "packages", "plugins");
const SERVICES_ROOT = join(ROOT, "packages", "agent", "src", "services");
const GATEWAY_ROOT = join(ROOT, "packages", "agent", "src", "gateway");
const RUNTIME_ROOT = join(ROOT, "packages", "agent", "src", "runtime");
const NATIVE_RUNTIME_ROOT = join(
  ROOT,
  "packages",
  "agent",
  "src",
  "runtime",
  "native",
);
const CONTRACTS_ROOT = join(ROOT, "packages", "contracts", "src");
const BOOTSTRAP_SCRIPTS_ROOT = join(ROOT, "scripts", "bootstrap");
const AGENT_SRC_ROOT = join(ROOT, "packages", "agent", "src");
const ALLOWED_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts"]);
const FORBIDDEN_IMPORT_PATTERNS: Array<{
  pattern: RegExp;
  reason: string;
}> = [
  {
    pattern: /from\s+["']@\/.+["']/u,
    reason: "imports agent source through the repo-local @/alias",
  },
  {
    pattern: /from\s+["'](?:\.\.\/)+(?:packages\/)?agent\/src\/.+["']/u,
    reason: "imports agent source through a relative path",
  },
];

const SERVICE_BRIDGE_ROOT_IMPORT_PATTERN =
  /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/runtime\/native\/service-bridge|(?:\.\.\/|\.\/)+(?:[^"']+\/)*service-bridge)["']/mu;

const SERVICE_BRIDGE_ROOT_TYPEOF_IMPORT_PATTERN =
  /typeof\s+import\(\s*["'](?:@\/runtime\/native\/service-bridge|(?:\.\.\/|\.\/)+(?:[^"']+\/)*service-bridge)["']\s*\)/mu;

const INTERNAL_FACADE_GUARDS: Array<{
  root: string;
  include: RegExp;
  patterns: Array<{ pattern: RegExp; reason: string }>;
}> = [
  {
    root: AGENT_SRC_ROOT,
    include: /packages\/agent\/src\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern: SERVICE_BRIDGE_ROOT_IMPORT_PATTERN,
        reason:
          "imports from the runtime/native service-bridge root instead of a domain entrypoint",
      },
      {
        pattern: SERVICE_BRIDGE_ROOT_TYPEOF_IMPORT_PATTERN,
        reason:
          "depends on the runtime/native service-bridge root for types instead of a domain entrypoint",
      },
    ],
  },
  {
    root: SERVICES_ROOT,
    include: /packages\/agent\/src\/services\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/services\/|(?:\.\.\/|\.\/)+)(cron-service|media-service|session-service|terminal-service|skills-service|trajectory-service|diagnostics-service|operator-service|web-service)["']/mu,
        reason:
          "imports through a service compatibility facade instead of a folder-owned module",
      },
    ],
  },
  {
    root: SERVICES_ROOT,
    include: /packages\/agent\/src\/services\/terminal\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/services\/terminal\/|(?:\.\.\/|\.\/)+)(terminal-service-[^"']+)["']/mu,
        reason:
          "imports terminal internals through a compatibility file instead of the folder-owned module",
      },
    ],
  },
  {
    root: SERVICES_ROOT,
    include: /packages\/agent\/src\/services\/media\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/services\/media\/|(?:\.\.\/|\.\/)+)(media-service-[^"']+)["']/mu,
        reason:
          "imports media internals through a compatibility file instead of the folder-owned module",
      },
    ],
  },
  {
    root: GATEWAY_ROOT,
    include:
      /packages\/agent\/src\/gateway\/(?:adapters|read|receive|recording|runner|state|supervision)\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/gateway\/|(?:\.\.\/|\.\/)+)(gateway-(?:attachment-helpers|delivery-flow|history-view|journal|message-journal|outbound-flow|platform-state|platform-state-view|read-model|receive-flow|replay-flow|state-snapshot|status-readiness|supervision-flow|trace-state|transport-detail))["']/mu,
        reason:
          "imports through a gateway compatibility facade instead of a folder-owned module",
      },
    ],
  },
  {
    root: RUNTIME_ROOT,
    include:
      /packages\/agent\/src\/runtime\/(?:(?!chat-turn\/compatibility\.test\.ts).)+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/runtime\/|(?:\.\.\/|\.\/)+)(chat-turn-(?:cache|connection|core|finalization|local-intent-orchestration|model-input|native|overrides|post-command|post-provider|prelude|provider|provider-handler|provider-streaming|response-shaping|shell|state))["']/mu,
        reason:
          "imports through a chat-turn compatibility facade instead of the folder-owned module",
      },
    ],
  },
  {
    root: NATIVE_RUNTIME_ROOT,
    include: /packages\/agent\/src\/runtime\/native\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/runtime\/native\/|(?:\.\.\/|\.\/)+)(account-auth|plugin-catalog|plugin-registry|service-bridge)\/index["']/mu,
        reason:
          "imports through an explicit runtime/native index path instead of the folder-owned module",
      },
    ],
  },
  {
    root: CONTRACTS_ROOT,
    include: /packages\/contracts\/src\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@doolittle\/contracts\/|(?:\.\.\/|\.\/)+)(browser|plugin-catalog|records|storage)["']/mu,
        reason: "imports contracts through a root shim instead of src/types",
      },
    ],
  },
  {
    root: BOOTSTRAP_SCRIPTS_ROOT,
    include:
      /scripts\/bootstrap\/(?!(?:core|wizard-screen)\/).+\/.+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:\.\.\/)+(?:output|prompt-ops|prompts|runtime-flags|wizard-screen|wizard-provider-flow)["']/mu,
        reason:
          "imports through a bootstrap root shim instead of the owning folder module",
      },
      {
        pattern:
          /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:\.\.\/)+(?:\.\.\/)+packages\/agent\/src\/runtime\/native\/account-auth["']/mu,
        reason:
          "imports bootstrap account-auth types through a non-canonical agent path",
      },
    ],
  },
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      if (entry === "dist" || entry === "node_modules") {
        continue;
      }
      files.push(...walk(fullPath));
      continue;
    }

    if (
      [...ALLOWED_EXTENSIONS].some((extension) => fullPath.endsWith(extension))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectInternalFacadeFailures(): string[] {
  const failures: string[] = [];

  for (const guard of INTERNAL_FACADE_GUARDS) {
    for (const filePath of walk(guard.root)) {
      const relativePath = relative(ROOT, filePath);
      if (!guard.include.test(relativePath)) {
        continue;
      }

      const source = readFileSync(filePath, "utf8");
      for (const { pattern, reason } of guard.patterns) {
        if (pattern.test(source)) {
          failures.push(`${relativePath} (${reason})`);
        }
      }
    }
  }

  return failures;
}

function main(): void {
  const pluginDirs = readdirSync(PLUGINS_ROOT)
    .filter((entry) => entry !== "node_modules" && !entry.startsWith("."))
    .map((entry) => join(PLUGINS_ROOT, entry))
    .filter((dir) => statSync(dir).isDirectory());

  const failures: string[] = [];

  for (const pluginDir of pluginDirs) {
    for (const filePath of walk(pluginDir)) {
      const source = readFileSync(filePath, "utf8");
      for (const { pattern, reason } of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(source)) {
          failures.push(`${relative(ROOT, filePath)} (${reason})`);
        }
      }
    }
  }

  failures.push(...collectInternalFacadeFailures());

  if (failures.length > 0) {
    console.error("Plugin boundary / internal facade check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log("Plugin boundary / internal facade check passed.");
}

main();
