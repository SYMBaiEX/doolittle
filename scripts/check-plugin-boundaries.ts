#!/usr/bin/env nub

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const PLUGINS_ROOT = join(ROOT, "packages", "plugins");
const DESKTOP_MAIN_ROOT = join(ROOT, "apps", "desktop", "src", "main");
const DESKTOP_RENDERER_ROOT = join(ROOT, "apps", "desktop", "src", "renderer");
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
const ACTIONS_ROOT = join(AGENT_SRC_ROOT, "actions");
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
  {
    pattern: /from\s+["']@doolittle\/agent(?:\/.+)?["']/u,
    reason: "imports the host application from a reusable plugin",
  },
];

const DUPLICATE_TEXT_MODEL_REGISTRATION_PATTERN =
  /\[\s*ModelType\.(?:TEXT_NANO|TEXT_SMALL|TEXT_MEDIUM|TEXT_LARGE|TEXT_MEGA|RESPONSE_HANDLER|ACTION_PLANNER|TEXT_REASONING_SMALL|TEXT_REASONING_LARGE|TEXT_COMPLETION)\s*\]\s*:/u;

const SERVICE_BRIDGE_ROOT_IMPORT_PATTERN =
  /^\s*import(?:\s+type)?[\s\S]*?from\s+["'](?:@\/runtime\/native\/service-bridge|(?:\.\.\/|\.\/)+(?:[^"']+\/)*service-bridge)["']/mu;

const SERVICE_BRIDGE_ROOT_TYPEOF_IMPORT_PATTERN =
  /typeof\s+import\(\s*["'](?:@\/runtime\/native\/service-bridge|(?:\.\.\/|\.\/)+(?:[^"']+\/)*service-bridge)["']\s*\)/mu;

const DIRECT_JSON_FILE_WRITE_PATTERN =
  /\bwriteFileSync\s*\(\s*[^,\n]+,\s*(?:`\$\{)?JSON\.stringify\s*\(/u;

const DIRECT_JSON_FILE_WRITE_REASON =
  "writes JSON directly instead of using Eliza's public atomic JSON helper";

const CUSTOM_LOGGER_IMPORT_PATTERN =
  /(?:from\s+|import\s*\()["']@doolittle\/logger["']/u;

const RETIRED_CODEX_PROVIDER_PATTERN =
  /@doolittle\/plugin-codex|chatgpt\.com\/backend-api\/codex\/responses/u;

const RETIRED_SECRETS_MANAGER_PATTERN =
  /["']secrets-manager["']|\bSecretsManagerService\b|\bNativeSecretsManagerService\b/u;

const UNNAMESPACED_PRODUCT_SERVICE_PATTERN =
  /(?:static\s+serviceType\s*=|(?:getService|getServiceLoadPromise)\s*\()\s*["'](?:code-generation|coding_agent|e2b|experience|forms|personality|rolodex)["']/u;

const INTERNAL_FACADE_GUARDS: Array<{
  root: string;
  include: RegExp;
  patterns: Array<{ pattern: RegExp; reason: string }>;
}> = [
  {
    root: AGENT_SRC_ROOT,
    include:
      /packages\/agent\/src\/(?!.+\.test\.[cm]?tsx?$).+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern: DIRECT_JSON_FILE_WRITE_PATTERN,
        reason: DIRECT_JSON_FILE_WRITE_REASON,
      },
      {
        pattern: CUSTOM_LOGGER_IMPORT_PATTERN,
        reason:
          "imports Doolittle's retired logger instead of the official @elizaos/logger package",
      },
      {
        pattern: RETIRED_CODEX_PROVIDER_PATTERN,
        reason:
          "restores Doolittle's retired Codex transport instead of the official @elizaos/plugin-codex-cli package",
      },
      {
        pattern: RETIRED_SECRETS_MANAGER_PATTERN,
        reason:
          "restores Doolittle's retired secrets manager instead of the official Eliza SECRETS service",
      },
      {
        pattern: UNNAMESPACED_PRODUCT_SERVICE_PATTERN,
        reason:
          "registers or resolves a Doolittle product service without a doolittle_ namespace",
      },
    ],
  },
  {
    root: DESKTOP_RENDERER_ROOT,
    include:
      /apps\/desktop\/src\/renderer\/(?!.+\.test\.[cm]?tsx?$).+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern: /console\.(?:debug|info|warn|error)\s*\(/u,
        reason: "bypasses the official @elizaos/logger renderer integration",
      },
      {
        pattern: CUSTOM_LOGGER_IMPORT_PATTERN,
        reason:
          "imports Doolittle's retired logger instead of the official @elizaos/logger package",
      },
      {
        pattern: /window\.doolittle\s*\.\s*api\b/u,
        reason:
          "restores the retired desktop JSON client instead of the official ElizaClient transport",
      },
    ],
  },
  {
    root: DESKTOP_RENDERER_ROOT,
    include:
      /apps\/desktop\/src\/renderer\/(?!(?:eliza-client)\.ts$)(?!.+\.test\.[cm]?tsx?$).+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern:
          /window\.doolittle\s*\.\s*requestAgent\b|@elizaos\/ui\/api\/(?:client-base|transport)/u,
        reason:
          "bypasses the single desktop adapter for the official ElizaClient transport",
      },
    ],
  },
  {
    root: PLUGINS_ROOT,
    include: /packages\/plugins\/(?!.+\.test\.[cm]?tsx?$).+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern: DIRECT_JSON_FILE_WRITE_PATTERN,
        reason: DIRECT_JSON_FILE_WRITE_REASON,
      },
      {
        pattern: CUSTOM_LOGGER_IMPORT_PATTERN,
        reason:
          "imports Doolittle's retired logger instead of the official @elizaos/logger package",
      },
      {
        pattern: RETIRED_CODEX_PROVIDER_PATTERN,
        reason:
          "restores Doolittle's retired Codex transport instead of the official @elizaos/plugin-codex-cli package",
      },
      {
        pattern: RETIRED_SECRETS_MANAGER_PATTERN,
        reason:
          "restores Doolittle's retired secrets manager instead of the official Eliza SECRETS service",
      },
      {
        pattern: UNNAMESPACED_PRODUCT_SERVICE_PATTERN,
        reason:
          "registers or resolves a Doolittle product service without a doolittle_ namespace",
      },
    ],
  },
  {
    root: DESKTOP_MAIN_ROOT,
    include:
      /apps\/desktop\/src\/main\/(?!(?:attachment-import|recorded-audio-import)\.ts$)(?!.+\.test\.[cm]?tsx?$).+\.(?:[cm]?ts|tsx)$/u,
    patterns: [
      {
        pattern: DIRECT_JSON_FILE_WRITE_PATTERN,
        reason: DIRECT_JSON_FILE_WRITE_REASON,
      },
      {
        pattern: CUSTOM_LOGGER_IMPORT_PATTERN,
        reason:
          "imports Doolittle's retired logger instead of the official @elizaos/logger package",
      },
    ],
  },
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
    root: AGENT_SRC_ROOT,
    include: /packages\/agent\/src\/(?:server\/auth|server)\.ts$/u,
    patterns: [
      {
        pattern:
          /\btimingSafeEqual\b|function\s+(?:extractBearerToken|isLoopbackHost|isApiRequestAuthorized|getRequestOriginPolicy|applyRequestCors|publishElizaApiPort)\b/u,
        reason:
          "reimplements Eliza API authentication, origin, host, or runtime-port policy instead of using the public SDK helpers",
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
    include:
      /packages\/agent\/src\/services\/mcp\/(?!.+\.test\.[cm]?ts$).+\.[cm]?ts$/u,
    patterns: [
      {
        pattern:
          /\brunShellCommand\b|node:child_process|["']list-tools["']|["']call-tool["']/u,
        reason:
          "reimplements MCP process execution or protocol commands instead of projecting the official @elizaos/plugin-mcp service",
      },
    ],
  },
  {
    root: SERVICES_ROOT,
    include: /packages\/agent\/src\/services\/types\.ts$/u,
    patterns: [
      {
        pattern: /^\s*trajectories\s*:/mu,
        reason:
          "names a product service like the SDK-owned trajectories lifecycle instead of an explicit evaluation projection",
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
    root: GATEWAY_ROOT,
    include:
      /packages\/agent\/src\/gateway\/platforms\/telegram-adapter\/(?!(?:.+\.)?test\.[cm]?ts$).+\.[cm]?ts$/u,
    patterns: [
      {
        pattern: /\bfetch\s*\(/u,
        reason:
          "bypasses the official Eliza Telegram service with a parallel HTTP transport",
      },
      {
        pattern: /\bFormData\b/u,
        reason:
          "reimplements Telegram Bot API uploads outside the official Eliza Telegram service",
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
    root: RUNTIME_ROOT,
    include:
      /packages\/agent\/src\/runtime\/bootstrap\/runtime\/(?!.+\.test\.[cm]?ts$).+\.[cm]?ts$/u,
    patterns: [
      {
        pattern: /\bruntime\.(?:stop|close)\s*\(/u,
        reason:
          "bypasses the official Eliza adapter-safe runtime shutdown lifecycle",
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
    root: NATIVE_RUNTIME_ROOT,
    include: /packages\/agent\/src\/runtime\/native\/agent-sdk\.ts$/u,
    patterns: [
      {
        pattern:
          /@elizaos\/plugin-agent-skills|\bgetCatalogSkills\b|\bgetTrendingSkills\b/u,
        reason:
          "creates a shadow skill-catalog client instead of projecting the official Agent Skills service",
      },
    ],
  },
  {
    root: NATIVE_RUNTIME_ROOT,
    include:
      /packages\/agent\/src\/runtime\/native\/service-bridge\/tooling\/(?:shell|mcp)\.ts$/u,
    patterns: [
      {
        pattern: /\bAppServices\b/u,
        reason:
          "allows a product-service fallback for a required Eliza lifecycle service",
      },
      {
        pattern: /\bservices\.(?:terminal|mcp)\b/u,
        reason: "bypasses the required Eliza shell or MCP lifecycle service",
      },
    ],
  },
  {
    root: NATIVE_RUNTIME_ROOT,
    include:
      /packages\/agent\/src\/runtime\/native\/service-bridge\/browser\/index\.ts$/u,
    patterns: [
      {
        pattern: /\bAppServices\b/u,
        reason:
          "allows a product-service fallback for the required Eliza browser lifecycle service",
      },
      {
        pattern: /\bservices\.web\b/u,
        reason: "bypasses the required Eliza browser lifecycle service",
      },
    ],
  },
  {
    root: NATIVE_RUNTIME_ROOT,
    include: /packages\/agent\/src\/runtime\/native\/service-manifest\.ts$/u,
    patterns: [
      {
        pattern:
          /capability:\s*["']codingAgent["'][^}]*productServices:\s*\[\s*["']/u,
        reason:
          "advertises a product fallback for the bootstrap-critical Eliza coding agent service",
      },
      {
        pattern:
          /capability:\s*["']agentSkills["'][^}]*productServices:\s*\[\s*["']/u,
        reason:
          "advertises a product fallback for the bootstrap-critical official Eliza Agent Skills service",
      },
      {
        pattern:
          /capability:\s*["']agentOrchestrator["'][^}]*productServices:\s*\[\s*["']/u,
        reason:
          "advertises a product fallback for the bootstrap-critical official Eliza Agent Orchestrator service",
      },
      {
        pattern:
          /capability:\s*["']trajectoryLogger["'][^}]*productServices:\s*\[\s*["']/u,
        reason:
          "advertises a product fallback for the bootstrap-critical official Eliza trajectories service",
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
  {
    root: BOOTSTRAP_SCRIPTS_ROOT,
    include: /scripts\/bootstrap\/provider\/cloud-compat\.ts$/u,
    patterns: [
      {
        pattern: /function\s+normalizeCloudSiteUrl\b/u,
        reason:
          "reimplements Eliza Cloud URL normalization instead of using the public SDK helper",
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

function collectModelPromptOwnershipFailures(): string[] {
  const failures: string[] = [];

  for (const filePath of walk(ACTIONS_ROOT)) {
    const relativePath = relative(ROOT, filePath);
    if (
      relativePath.endsWith(".test.ts") ||
      relativePath.endsWith(".test.tsx")
    ) {
      continue;
    }

    const source = readFileSync(filePath, "utf8");
    if (!/\.useModel\s*\(/u.test(source)) {
      continue;
    }

    if (
      !/\bbuildCacheablePrompt\s*\(/u.test(source) ||
      !/\bpromptCacheMetrics\.recordPlan\s*\(/u.test(source)
    ) {
      failures.push(
        `${relativePath} (owns a direct runtime.useModel prompt without the shared prompt-cache builder and plan telemetry)`,
      );
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
      if (DUPLICATE_TEXT_MODEL_REGISTRATION_PATTERN.test(source)) {
        failures.push(
          `${relative(ROOT, filePath)} (redeclares the shared Eliza text model surface instead of using createElizaTextGenerationModelHandlers)`,
        );
      }
    }
  }

  failures.push(...collectInternalFacadeFailures());
  failures.push(...collectModelPromptOwnershipFailures());

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
