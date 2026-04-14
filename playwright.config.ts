import { defineConfig } from "@playwright/test";

const runtimePort = process.env.DOOLITTLE_RUNTIME_PORT ?? "49698";
const e2ePort = process.env.DOOLITTLE_E2E_PORT ?? "49697";
const baseURL =
  process.env.DOOLITTLE_E2E_BASE_URL ?? `http://127.0.0.1:${e2ePort}`;
const e2eServerScript = `
const { mkdtempSync } = await import("node:fs");
const { createServer } = await import("node:http");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");

const repoRoot = process.cwd();
const supportDir = join(repoRoot, "e2e", "support");
const dataDir = mkdtempSync(join(tmpdir(), "doolittle-e2e-"));
const runtimePort = Number(${JSON.stringify(runtimePort)});
const port = Number(${JSON.stringify(e2ePort)});

const applyE2eEnv = () => {
  process.env.PATH = supportDir + ":" + (process.env.PATH ?? "");
  process.env.DOOLITTLE_NAME = "Doolittle E2E";
  process.env.DOOLITTLE_MODE = "api";
  process.env.DOOLITTLE_HOST = "127.0.0.1";
  process.env.DOOLITTLE_PORT = String(runtimePort);
  process.env.DOOLITTLE_DATA_DIR = dataDir;
  process.env.DOOLITTLE_OFFLINE_BOOTSTRAP = "true";
  process.env.DOOLITTLE_BROWSER_PROVIDER = "lightpanda";
  process.env.DOOLITTLE_BROWSER_COMMAND = "mock-lightpanda.ts";
  process.env.DOOLITTLE_BROWSER_OBEY_ROBOTS = "false";
  process.env.DOOLITTLE_ALLOW_ALL_USERS = "true";
  process.env.DOOLITTLE_PAIRING_MODE = "allow";
  process.env.DOOLITTLE_WORKSPACE_DIR = repoRoot;
  process.env.PGLITE_DATA_DIR = join(dataDir, "pglite");
  process.env.OPENAI_API_KEY = "";
  process.env.ANTHROPIC_API_KEY = "";
  process.env.ELIZAOS_CLOUD_API_KEY = "";
  process.env.FAL_API_KEY = "";
  process.env.MCP_SERVER_COMMAND = "";
  process.env.ACP_SERVER_COMMAND = "";
};

const { getAppContext } = await import("./packages/agent/src/runtime/bootstrap");
applyE2eEnv();
const context = await getAppContext({ startupMode: "api" });

function json(body, status = 200) {
  return JSON.stringify(body, null, 2);
}

function sendJson(res, body, status = 200) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
  res.end(json(body, status));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  }
  if (!body.trim()) {
    return {};
  }
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

const server = createServer(async (req, res) => {
  const method = req.method ?? "GET";
  const url = new URL(req.url ?? "/", "http://127.0.0.1:" + port);

  if (method === "OPTIONS") {
    sendJson(res, { ok: true });
    return;
  }

  if (method === "GET" && url.pathname === "/health") {
    sendJson(res, {
      status: "ok",
      name: context.config.agentName,
      mode: "api",
    });
    return;
  }

  if (method === "GET" && url.pathname === "/runtime/plugins") {
    const { getNativePluginCatalog, groupNativePluginCatalog } = await import(
      "./packages/agent/src/runtime/native/plugin-catalog/index.ts"
    );
    const catalog = getNativePluginCatalog(context.config);
    sendJson(res, {
      catalog,
      grouped: groupNativePluginCatalog(catalog),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/browser/status") {
    const { getEffectiveBrowserStatus } = await import(
      "./packages/agent/src/runtime/native/service-bridge/browser/index.ts"
    );
    sendJson(res, {
      browser: await getEffectiveBrowserStatus(context.runtime, context.services),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/browser/capture") {
    const { captureEffectiveBrowserPage } = await import(
      "./packages/agent/src/runtime/native/service-bridge/browser/index.ts"
    );
    const body = await readJson(req);
    if (!body.url) {
      sendJson(res, { error: "url is required" }, 400);
      return;
    }
    sendJson(res, {
      capture: await captureEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url,
      ),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/chat") {
    const { executeAgentTurnWithProgress } = await import(
      "./packages/agent/src/runtime/turn-stream.ts"
    );
    const body = await readJson(req);
    if (!body.message) {
      sendJson(res, { error: "message is required" }, 400);
      return;
    }

    const { response } = await executeAgentTurnWithProgress(
      {
        message: body.message,
        userId: body.userId ?? "api-user",
        roomId: body.roomId,
        source: body.source ?? "api",
      },
      context,
    );

    sendJson(res, {
      response,
      character: context.config.agentName,
    });
    return;
  }

  sendJson(res, { error: "not found" }, 404);
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await new Promise((resolve, reject) => {
  server.once("error", async (error) => {
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
    if (code === "EADDRINUSE") {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const ready = await fetch("http://127.0.0.1:" + port + "/health")
          .then((response) => response.ok)
          .catch(() => false);
        if (ready) {
          console.log(
            "Doolittle E2E API already available on http://127.0.0.1:" + port,
          );
          resolve();
          return;
        }
        await wait(250);
      }
    }
    reject(error);
  });
  server.listen(port, "127.0.0.1", resolve);
});

process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

console.log("Doolittle E2E API listening on http://127.0.0.1:" + port);
await new Promise(() => {});
`;
const e2eServerModule = Buffer.from(e2eServerScript, "utf8").toString("base64");
const e2eServerCommand =
  `bun -e "(async () => { ` +
  `const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor; ` +
  `const source = Buffer.from('${e2eServerModule}', 'base64').toString(); ` +
  `await new AsyncFunction(source)(); ` +
  `})()"`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.pw\.ts/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  outputDir: "./var/playwright/test-results",
  reporter: [["list", { printSteps: true }]],
  timeout: 60_000,
  use: {
    baseURL,
  },
  webServer: {
    command: e2eServerCommand,
    url: `${baseURL}/health`,
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
});
