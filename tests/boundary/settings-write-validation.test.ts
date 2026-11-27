import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildEnvConfig } from "../../packages/agent/src/config/env/build";
import { resolveManagedDirectories } from "../../packages/agent/src/config/env/directories";
import { parseEnv } from "../../packages/agent/src/config/env/schema";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap";
import { handleSettingsExecutionRoutes } from "../../packages/agent/src/server/routes/settings-execution";
import { resolveDefaultServiceModel } from "../../packages/agent/src/services/bootstrap/model";
import { createServiceSettings } from "../../packages/agent/src/services/bootstrap/settings";
import { validateSettingValue } from "../../packages/agent/src/services/settings/validation";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "doolittle-settings-validation-"));
  roots.push(root);
  const environment = { DOOLITTLE_DATA_DIR: root };
  const values = parseEnv(environment);
  const config = buildEnvConfig(
    values,
    resolveManagedDirectories(root, values),
    environment,
  );
  const settings = createServiceSettings(
    config,
    resolveDefaultServiceModel(config),
  );
  const context = {
    services: { settings },
  } as unknown as AppContext;
  const post = async (body: unknown) => {
    const url = new URL("/settings", "http://127.0.0.1");
    const response = await handleSettingsExecutionRoutes(
      context,
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      url,
    );
    if (!response) throw new Error("Settings route did not match.");
    return response;
  };
  return {
    root,
    settings,
    post,
    settingsFile: () => readFileSync(join(root, "settings.json"), "utf8"),
  };
}

it.each([
  ["model.temperature", -100, "from 0 to 2"],
  ["model.maxTokens", 0, "greater than or equal to 1"],
  ["gateway.sessionTimeoutMinutes", 0, "greater than 0"],
  ["execution.commandTimeoutMs", -5, "from 1000 to 120000"],
  ["execution.commandTimeoutMs", 500, "from 1000 to 120000"],
  ["execution.commandTimeoutMs", 120_001, "from 1000 to 120000"],
  ["execution.commandTimeoutMs", 1.5, "an integer"],
  ["execution.commandTimeoutMs", "60000", "an integer"],
  ["execution.healthTimeoutMs", 0, "greater than or equal to 1"],
  ["execution.containerPidsLimit", 0, "greater than or equal to 1"],
  ["execution.sshPort", 99999, "from 1 to 65535"],
  ["execution.sshPort", 22.5, "an integer"],
  ["mcp.maxRetries", -1, "greater than or equal to 0"],
  ["agent.maxIterations", 0, "greater than or equal to 1"],
])(
  "rejects invalid numeric setting %s without writing it",
  async (path, value, expectation) => {
    const f = fixture();
    const before = f.settingsFile();
    const response = await f.post({ path, value });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining(expectation),
    });
    expect(f.settingsFile()).toBe(before);
  },
);

it.each([
  ["execution.backend", "upload"],
  ["execution.remoteSyncMode", "upload"],
  ["execution.remoteArtifactPolicy", "download"],
  ["agent.runDepth", "minimal"],
  ["agent.toolProgressMode", "loud"],
  ["model.reasoningEffort", "impossible"],
  ["ui.theme", "not-a-theme"],
  ["mcp.servers.docs.type", "websocket"],
])(
  "rejects invalid enum setting %s without writing it",
  async (path, value) => {
    const f = fixture();
    const before = f.settingsFile();
    const response = await f.post({ path, value });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining(`${path} must be one of:`),
    });
    expect(f.settingsFile()).toBe(before);
  },
);

it.each(["", " openai ", null])(
  "rejects malformed model.provider write %s without changing settings",
  async (value) => {
    const f = fixture();
    const before = f.settingsFile();
    const response = await f.post({ path: "model.provider", value });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: expect.stringContaining(
        "model.provider must be a non-empty string",
      ),
    });
    expect(f.settingsFile()).toBe(before);
  },
);

it.each([
  ["model.baseUrl", "not a url"],
  ["model.baseUrl", "ftp://example.com/api"],
  ["mcp.servers.docs.url", "not a url"],
  ["mcp.servers.docs.url", ""],
])("rejects invalid URL setting %s without writing it", async (path, value) => {
  const f = fixture();
  const before = f.settingsFile();
  const response = await f.post({ path, value });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("valid HTTP or HTTPS URL"),
  });
  expect(f.settingsFile()).toBe(before);
});

it("admits optional route values and MCP settings that existing clients intentionally write", () => {
  expect(validateSettingValue("model.provider", "devin")).toBeUndefined();
  expect(
    validateSettingValue("model.provider", "extension-model-handler"),
  ).toBeUndefined();
  expect(validateSettingValue("model.reasoningEffort", null)).toBeUndefined();
  expect(validateSettingValue("model.baseUrl", "")).toBeUndefined();
  expect(
    validateSettingValue("model.baseUrl", "https://example.com/v1"),
  ).toBeUndefined();
  expect(
    validateSettingValue("mcp.servers.docs.url", "https://example.com/mcp"),
  ).toBeUndefined();
  expect(
    validateSettingValue("mcp.servers.docs.timeoutInMillis", 10_000),
  ).toBeUndefined();
});

it("rejects a batch atomically when any setting value is invalid", async () => {
  const f = fixture();
  const before = f.settingsFile();
  const response = await f.post({
    changes: [
      { path: "execution.commandTimeoutMs", value: 60_000 },
      { path: "execution.sshPort", value: 99_999 },
    ],
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: expect.stringContaining("execution.sshPort"),
  });
  expect(f.settings.get().execution.commandTimeoutMs).not.toBe(60_000);
  expect(f.settingsFile()).toBe(before);
});

it("accepts canonical enum values advertised by the runtime contracts", async () => {
  const f = fixture();
  const response = await f.post({
    changes: [
      { path: "execution.backend", value: "podman" },
      { path: "execution.remoteSyncMode", value: "snapshot" },
      { path: "execution.remoteArtifactPolicy", value: "allowlisted" },
      { path: "agent.runDepth", value: "explore" },
      { path: "agent.toolProgressMode", value: "verbose" },
    ],
  });
  expect(response.status).toBe(200);
  expect(f.settings.get().execution).toMatchObject({
    backend: "podman",
    remoteSyncMode: "snapshot",
    remoteArtifactPolicy: "allowlisted",
  });
  expect(f.settings.get().agent).toMatchObject({
    runDepth: "explore",
    toolProgressMode: "verbose",
  });
});
