import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = join(
  process.cwd(),
  "scripts",
  "check-plugin-boundaries.ts",
);
const NUB_PATH = join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "nub.cmd" : "nub",
);

function createBoundaryFixture(options: {
  includeInternalFacadeViolation?: boolean;
  includeDuplicatedModelRegistrations?: boolean;
  includeUnownedModelPrompt?: boolean;
  includeRawTelegramTransport?: boolean;
  includeShadowSkillCatalog?: boolean;
  includeManualRuntimeShutdown?: boolean;
  includeHostApplicationImport?: boolean;
  includeCustomServerSecurity?: boolean;
  includeCustomCloudNormalization?: boolean;
  includeDirectJsonWrite?: boolean;
  includeRetiredCodexProvider?: boolean;
}): string {
  const root = mkdtempSync(join(tmpdir(), "doolittle-boundary-"));

  const packagesDir = join(root, "packages");
  const requiredDirs = [
    join(packagesDir, "plugins"),
    join(packagesDir, "plugins", "plugin-dummy"),
    join(packagesDir, "agent", "src", "services"),
    join(packagesDir, "agent", "src", "server"),
    join(packagesDir, "agent", "src", "gateway"),
    join(
      packagesDir,
      "agent",
      "src",
      "gateway",
      "platforms",
      "telegram-adapter",
    ),
    join(packagesDir, "agent", "src", "runtime"),
    join(packagesDir, "agent", "src", "runtime", "bootstrap", "runtime"),
    join(packagesDir, "agent", "src", "runtime", "native"),
    join(packagesDir, "agent", "src", "actions"),
    join(packagesDir, "contracts", "src"),
    join(root, "apps", "desktop", "src", "main"),
    join(root, "apps", "desktop", "src", "renderer"),
    join(root, "scripts", "bootstrap", "provider"),
  ];

  for (const dir of requiredDirs) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(
    join(packagesDir, "agent", "src", "actions", "model-action.ts"),
    options.includeUnownedModelPrompt
      ? "export async function run(runtime: { useModel(type: string, params: unknown): Promise<unknown> }) { return runtime.useModel('TEXT_LARGE', { prompt: 'ad hoc' }); }\n"
      : 'export const action = "no-owned-model-call";\n',
    "utf8",
  );

  writeFileSync(
    join(packagesDir, "agent", "src", "server", "auth.ts"),
    options.includeCustomServerSecurity
      ? 'import { timingSafeEqual } from "node:crypto";\nexport const compare = timingSafeEqual;\n'
      : 'export { isAuthorized } from "@elizaos/agent/api/server-helpers-auth";\n',
    "utf8",
  );

  writeFileSync(
    join(root, "scripts", "bootstrap", "provider", "cloud-compat.ts"),
    options.includeCustomCloudNormalization
      ? "export function normalizeCloudSiteUrl(value: string) { return value; }\n"
      : 'export { normalizeCloudSiteUrl } from "@elizaos/shared/elizacloud/base-url";\n',
    "utf8",
  );

  writeFileSync(
    join(packagesDir, "agent", "src", "services", "settings-service.ts"),
    options.includeDirectJsonWrite
      ? 'import { writeFileSync } from "node:fs";\nexport function persist(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value, null, 2), "utf8"); }\n'
      : 'import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";\nexport const persist = writeJsonAtomicSync;\n',
    "utf8",
  );

  writeFileSync(
    join(packagesDir, "agent", "src", "runtime", "native", "agent-sdk.ts"),
    options.includeShadowSkillCatalog
      ? 'import { getCatalogSkills } from "@elizaos/plugin-agent-skills";\nexport const catalog = getCatalogSkills;\n'
      : 'export const sdkAudit = "packages-and-registry-only";\n',
    "utf8",
  );

  writeFileSync(
    join(packagesDir, "agent", "src", "runtime", "native", "providers.ts"),
    options.includeRetiredCodexProvider
      ? 'import { createCodexPlugin } from "@doolittle/plugin-codex";\nexport const provider = createCodexPlugin;\n'
      : 'export { default as provider } from "@elizaos/plugin-codex-cli";\n',
    "utf8",
  );

  writeFileSync(
    join(
      packagesDir,
      "agent",
      "src",
      "runtime",
      "bootstrap",
      "runtime",
      "initialization.ts",
    ),
    options.includeManualRuntimeShutdown
      ? "export async function shutdown(runtime: { stop(): Promise<void> }) { await runtime.stop(); }\n"
      : 'export const lifecycle = "official-eliza-shutdown";\n',
    "utf8",
  );

  writeFileSync(
    join(packagesDir, "plugins", "plugin-dummy", "index.ts"),
    options.includeHostApplicationImport
      ? 'import type { AppServices } from "@doolittle/agent/services";\nexport type Host = AppServices;\n'
      : options.includeDuplicatedModelRegistrations
        ? "export const plugin = { models: { [ModelType.TEXT_LARGE]: handler } };\n"
        : 'export const plugin = "ok";\n',
    "utf8",
  );

  const serviceFile = join(packagesDir, "agent", "src", "services", "bad.ts");
  if (options.includeInternalFacadeViolation) {
    writeFileSync(
      serviceFile,
      'import { bad } from "@/services/media-service";\nexport const ignored = bad;\n',
      "utf8",
    );
  } else {
    writeFileSync(
      serviceFile,
      'export const good = "internal-clean";\n',
      "utf8",
    );
  }

  writeFileSync(
    join(
      packagesDir,
      "agent",
      "src",
      "gateway",
      "platforms",
      "telegram-adapter",
      "transport.ts",
    ),
    options.includeRawTelegramTransport
      ? "export async function send(url: string) { return fetch(url); }\n"
      : 'export const transport = "runtime-owned";\n',
    "utf8",
  );

  return root;
}

function runScript(cwd: string): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const environment = { ...process.env };
  delete environment.NODE_OPTIONS;
  const result = spawnSync(NUB_PATH, [SCRIPT_PATH], {
    cwd,
    env: environment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    status: result.status,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  };
}

let fixture = "";

beforeEach(() => {
  fixture = "";
});

afterEach(() => {
  if (fixture) {
    rmSync(fixture, { recursive: true, force: true });
  }
});

describe("check-plugin-boundaries", () => {
  it("passes when all plugin and internal imports are canonical", () => {
    fixture = createBoundaryFixture({});
    const result = runScript(fixture);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Plugin boundary / internal facade check passed.",
    );
  });

  it("reports internal service facade violations", () => {
    fixture = createBoundaryFixture({ includeInternalFacadeViolation: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "imports through a service compatibility facade instead of a folder-owned module",
    );
    expect(result.stderr).toContain("bad.ts");
  });

  it("rejects duplicated provider model registration surfaces", () => {
    fixture = createBoundaryFixture({
      includeDuplicatedModelRegistrations: true,
    });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "redeclares the shared Eliza text model surface",
    );
    expect(result.stderr).toContain("plugin-dummy/index.ts");
  });

  it("rejects reusable plugins that import the host application", () => {
    fixture = createBoundaryFixture({ includeHostApplicationImport: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "imports the host application from a reusable plugin",
    );
    expect(result.stderr).toContain("plugin-dummy/index.ts");
  });

  it("rejects the retired Doolittle Codex provider transport", () => {
    fixture = createBoundaryFixture({ includeRetiredCodexProvider: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "restores Doolittle's retired Codex transport instead of the official @elizaos/plugin-codex-cli package",
    );
    expect(result.stderr).toContain("runtime/native/providers.ts");
  });

  it("rejects action-owned model prompts outside the shared cache contract", () => {
    fixture = createBoundaryFixture({ includeUnownedModelPrompt: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "owns a direct runtime.useModel prompt without the shared prompt-cache builder",
    );
    expect(result.stderr).toContain("model-action.ts");
  });

  it("rejects a parallel raw Telegram transport", () => {
    fixture = createBoundaryFixture({ includeRawTelegramTransport: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "bypasses the official Eliza Telegram service",
    );
    expect(result.stderr).toContain("telegram-adapter/transport.ts");
  });

  it("rejects a shadow skill-catalog client in the SDK audit facade", () => {
    fixture = createBoundaryFixture({ includeShadowSkillCatalog: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "creates a shadow skill-catalog client instead of projecting the official Agent Skills service",
    );
    expect(result.stderr).toContain("runtime/native/agent-sdk.ts");
  });

  it("rejects manual runtime teardown inside the bootstrap lifecycle", () => {
    fixture = createBoundaryFixture({ includeManualRuntimeShutdown: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "bypasses the official Eliza adapter-safe runtime shutdown lifecycle",
    );
    expect(result.stderr).toContain(
      "runtime/bootstrap/runtime/initialization.ts",
    );
  });

  it("rejects custom API security policy in the server adapter", () => {
    fixture = createBoundaryFixture({ includeCustomServerSecurity: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "reimplements Eliza API authentication, origin, host, or runtime-port policy",
    );
    expect(result.stderr).toContain("server/auth.ts");
  });

  it("rejects custom Eliza Cloud URL normalization", () => {
    fixture = createBoundaryFixture({
      includeCustomCloudNormalization: true,
    });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "reimplements Eliza Cloud URL normalization",
    );
    expect(result.stderr).toContain("provider/cloud-compat.ts");
  });

  it("rejects direct JSON persistence outside approved transactions", () => {
    fixture = createBoundaryFixture({ includeDirectJsonWrite: true });
    const result = runScript(fixture);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "writes JSON directly instead of using Eliza's public atomic JSON helper",
    );
    expect(result.stderr).toContain("services/settings-service.ts");
  });
});
