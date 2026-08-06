import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { defineConfig } from "@playwright/test";

function fallbackPort(base: number): string {
  return String(base + Math.floor(Math.random() * 1000));
}

const runtimePort = process.env.DOOLITTLE_RUNTIME_PORT ?? fallbackPort(49600);
const e2ePort = process.env.DOOLITTLE_E2E_PORT ?? fallbackPort(50600);
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
const gatewayInbox = [
  {
    recordId: "gateway-in-1",
    at: "2026-07-27T15:04:00.000Z",
    platform: "telegram",
    status: "received",
    sessionId: "sess-gateway-1",
    roomId: "room-orange",
    threadId: "thread-alpha",
    authorName: "Alex",
    textPreview: "Please confirm the orange operator theme made it through review.",
    attachmentCount: 1,
  },
];
const gatewayOutbox = [
  {
    recordId: "gateway-out-1",
    at: "2026-07-27T15:05:00.000Z",
    platform: "telegram",
    status: "sent",
    sessionId: "sess-gateway-1",
    roomId: "room-orange",
    threadId: "thread-alpha",
    authorName: "Doolittle",
    textPreview: "Build accepted on branch sym/orange-ui with the updated desktop shell.",
    attachmentCount: 0,
  },
];
const gatewaySessions = [
  {
    sessionKey: "sess-gateway-1",
    platform: "telegram",
    roomId: "room-orange",
    threadId: "thread-alpha",
    updatedAt: "2026-07-27T15:05:00.000Z",
    activeAgentSessionId: "desktop-chat-1",
  },
];
const toolCatalog = [
  {
    id: "workspace.search",
    name: "Workspace search",
    description: "Search the current repository with ripgrep-backed indexing.",
    category: "workspace",
    transport: "native",
    enabled: true,
  },
  {
    id: "gateway.replay",
    name: "Gateway replay",
    description: "Reprocess a recorded inbound preview on the original thread route.",
    category: "gateway",
    transport: "native",
    enabled: true,
  },
];
const acpTools = [
  {
    name: "workspace.search",
    description: "Search the active workspace for a string or file path.",
    kind: "command",
    source: "local-registry",
  },
  {
    name: "agent.inspect",
    description: "Inspect the local agent runtime state.",
    kind: "diagnostic",
    source: "local-registry",
  },
];

function filterAcpTools(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return acpTools;
  return acpTools.filter((tool) =>
    [tool.name, tool.description, tool.kind, tool.source]
      .join(" ")
      .toLowerCase()
      .includes(normalized),
  );
}

function profileRecallHits(query) {
  const normalized = String(query ?? "").trim().toLowerCase();
  if (!normalized) return [];
  return [
    {
      kind: "preference",
      value: "Orange operator theme",
      score: 0.98,
    },
    {
      kind: "project",
      value: "Hermes-style desktop shell",
      score: 0.91,
    },
    {
      kind: "context",
      value: "Gateway inbox review lane",
      score: 0.84,
    },
  ].filter((entry) =>
    [entry.kind, entry.value].join(" ").toLowerCase().includes(normalized),
  );
}

const applyE2eEnv = () => {
  process.env.PATH = supportDir + ":" + (process.env.PATH ?? "");
  process.env.DOOLITTLE_NAME = "Doolittle E2E";
  process.env.DOOLITTLE_MODE = "api";
  process.env.ELIZA_API_BIND = "127.0.0.1";
  process.env.ELIZA_API_PORT = String(runtimePort);
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

const { getAppContext } = await import(
  "../../packages/agent/src/runtime/bootstrap/index.ts"
);
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
      "../../packages/agent/src/runtime/native/plugin-catalog/index.ts"
    );
    const catalog = getNativePluginCatalog(context.config);
    sendJson(res, {
      catalog,
      grouped: groupNativePluginCatalog(catalog),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/gateway/state") {
    sendJson(res, {
      state: {
        running: true,
        reason: "Gateway journaling locally with replay enabled for recorded inbound previews.",
        totals: {
          configuredPlatforms: 2,
          operationalTransports: 2,
          readyAdapters: 2,
        },
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/gateway/inbox") {
    sendJson(res, { inbox: gatewayInbox });
    return;
  }

  if (method === "GET" && url.pathname === "/gateway/outbox") {
    sendJson(res, { outbox: gatewayOutbox });
    return;
  }

  if (method === "GET" && url.pathname === "/sessions/gateway") {
    sendJson(res, { sessions: gatewaySessions });
    return;
  }

  if (method === "POST" && url.pathname === "/gateway/replay") {
    const body = await readJson(req);
    sendJson(res, { ok: true, replayedRecordId: body.recordId ?? null });
    return;
  }

  if (method === "GET" && url.pathname === "/tools") {
    sendJson(res, { tools: toolCatalog });
    return;
  }

  if (method === "GET" && url.pathname === "/tools/summary") {
    sendJson(res, {
      summary: {
        total: toolCatalog.length,
        enabled: toolCatalog.filter((entry) => entry.enabled !== false).length,
        disabled: toolCatalog.filter((entry) => entry.enabled === false).length,
        categories: [...new Set(toolCatalog.map((entry) => entry.category))],
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/acp/status") {
    sendJson(res, {
      acp: {
        enabled: true,
        detail: "Configured ACP command bridge for local discovery.",
        command: "acp-local --registry ./fixtures/acp.json",
        timeoutMs: 5000,
        toolCount: acpTools.length,
        lastProbeAt: "2026-07-27T15:06:00.000Z",
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/acp/editor") {
    sendJson(res, {
      editor: {
        commandConfigured: true,
        registryPath: "/tmp/doolittle-e2e/acp-registry.json",
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/acp/sessions") {
    sendJson(res, {
      sessions: {
        totalSessions: 3,
        recentSessionIds: ["acp-1", "acp-2", "acp-3"],
        titledSessions: 2,
        recentTitles: ["Workspace diagnostics", "Gateway follow-up"],
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/acp/tools") {
    sendJson(res, { tools: filterAcpTools(url.searchParams.get("query")) });
    return;
  }

  if (method === "POST" && url.pathname === "/acp/probe") {
    sendJson(res, {
      probe: {
        ok: true,
        detail: "ACP command responded to --help within the local timeout.",
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/memory") {
    const target = url.searchParams.get("target") === "user" ? "user" : "memory";
    const preview =
      target === "memory"
        ? [
            "Orange-first desktop shell approved for operator polish.",
            "Gateway replay kept behind explicit confirmation.",
          ]
        : [
            "User likes minimal, fast desktop workflows.",
            "Prefer Hermes-style desktop framing with orange accenting.",
          ];
    sendJson(res, {
      summary: {
        entries: preview.length,
        characters: preview.join("\\n").length,
        target,
        preview,
      },
      snapshot: JSON.stringify(
        {
          target,
          preview,
          updatedAt: "2026-07-27T15:07:00.000Z",
        },
        null,
        2,
      ),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/profiles/summary") {
    sendJson(res, {
      summary: {
        agentName: "Doolittle",
        totalProfiles: 12,
        totalBeliefs: 34,
        trustedRelationships: 4,
        engagedProfiles: 7,
      },
    });
    return;
  }

  if (method === "GET" && url.pathname === "/profiles/agent") {
    sendJson(res, {
      card: [
        "Doolittle operator card",
        "- Theme: orange-first, minimal desktop framing",
        "- Mode: local-first ElizaOS agent shell",
      ].join("\\n"),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/profiles/users/recall") {
    sendJson(res, {
      hits: profileRecallHits(url.searchParams.get("query")),
    });
    return;
  }

  if (method === "GET" && url.pathname === "/browser/status") {
    const { getBrowserStatus } = await import(
      "../../packages/agent/src/runtime/native/service-bridge/browser/index.ts"
    );
    sendJson(res, {
      browser: await getBrowserStatus(context.runtime),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/browser/capture") {
    const { captureBrowserPage } = await import(
      "../../packages/agent/src/runtime/native/service-bridge/browser/index.ts"
    );
    const body = await readJson(req);
    if (!body.url) {
      sendJson(res, { error: "url is required" }, 400);
      return;
    }
    sendJson(res, {
      capture: await captureBrowserPage(context.runtime, body.url),
    });
    return;
  }

  if (method === "POST" && url.pathname === "/chat") {
    const { executeAgentTurnWithProgress } = await import(
      "../../packages/agent/src/runtime/turn-stream.ts"
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
const e2eServerPath = resolve("var", "playwright", "e2e-server.ts");
mkdirSync(dirname(e2eServerPath), { recursive: true });
writeFileSync(e2eServerPath, e2eServerScript, "utf8");
const e2eServerCommand = `nub ${JSON.stringify(e2eServerPath)}`;

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
