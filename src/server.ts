import { createHmac, timingSafeEqual } from "node:crypto";
import { featureMap } from "@/config/feature-map";
import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import { normalizeInboundMessage } from "@/gateway/message-normalization";
import type { AppContext } from "@/runtime/bootstrap";
import {
  handleAgentTurn,
  runDelegationTaskInWorker,
  runModelAnalysisTurn,
  syncProviderSettings,
} from "@/runtime/chat";
import { DiagnosticsService } from "@/services/diagnostics-service";
import type {
  GatewayConfig,
  IncomingPlatformMessage,
  PlatformName,
} from "@/types";

type GatewayTraceKind =
  | "receive"
  | "authorize"
  | "session"
  | "route"
  | "respond"
  | "deliver"
  | "heartbeat"
  | "reject"
  | "lifecycle";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    },
  });
}

function verifySlackSignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret?: string,
): boolean {
  if (!signingSecret) {
    return true;
  }
  if (!timestamp || !signature) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${createHmac("sha256", signingSecret).update(base).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function parseJsonBody<T>(
  request: Request,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  try {
    return {
      ok: true,
      value: (await request.json()) as T,
    };
  } catch {
    return {
      ok: false,
      response: json({ error: "Invalid JSON body." }, 400),
    };
  }
}

function parseGatewayFilters(url: URL): {
  limit: number;
  platform?: PlatformName;
  sessionId?: string;
  kind?: GatewayTraceKind;
} {
  const rawLimit = Number(url.searchParams.get("limit") ?? "25");
  const platform = url.searchParams.get("platform") ?? undefined;
  const sessionId =
    url.searchParams.get("sessionId") ??
    url.searchParams.get("session") ??
    undefined;
  const kind = url.searchParams.get("kind") ?? undefined;
  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? 25 : rawLimit,
    platform:
      platform &&
      [
        "telegram",
        "discord",
        "slack",
        "whatsapp",
        "signal",
        "matrix",
        "email",
        "sms",
        "mattermost",
        "homeassistant",
        "dingtalk",
        "api",
      ].includes(platform)
        ? (platform as PlatformName)
        : undefined,
    sessionId,
    kind:
      kind &&
      [
        "receive",
        "authorize",
        "session",
        "route",
        "respond",
        "deliver",
        "heartbeat",
        "reject",
        "lifecycle",
      ].includes(kind)
        ? (kind as GatewayTraceKind)
        : undefined,
  };
}

function parseDelegationFilters(url: URL): {
  limit: number;
  group?: string;
  profile?: string;
  priority?: "low" | "normal" | "high";
  label?: string;
  parentTaskId?: string;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  executionMode?: "local" | "delegated";
} {
  const rawLimit = Number(url.searchParams.get("limit") ?? "25");
  const priority = url.searchParams.get("priority") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined;
  const executionMode =
    url.searchParams.get("executionMode") ??
    url.searchParams.get("mode") ??
    undefined;

  return {
    limit: Number.isNaN(rawLimit) || rawLimit <= 0 ? 25 : rawLimit,
    group: url.searchParams.get("group") ?? undefined,
    profile: url.searchParams.get("profile") ?? undefined,
    priority:
      priority && ["low", "normal", "high"].includes(priority)
        ? (priority as "low" | "normal" | "high")
        : undefined,
    label:
      url.searchParams.get("label") ?? url.searchParams.get("tag") ?? undefined,
    parentTaskId:
      url.searchParams.get("parentTaskId") ??
      url.searchParams.get("parent") ??
      undefined,
    status:
      status &&
      ["pending", "running", "completed", "failed", "cancelled"].includes(
        status,
      )
        ? (status as
            | "pending"
            | "running"
            | "completed"
            | "failed"
            | "cancelled")
        : undefined,
    executionMode:
      executionMode === "local" || executionMode === "delegated"
        ? executionMode
        : undefined,
  };
}

export function startApiServer(context: AppContext): void {
  Bun.serve({
    hostname: context.config.host,
    port: context.config.port,
    fetch: async (request) => {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") {
        return json({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/health") {
        return json({
          status: "ok",
          name: context.config.agentName,
          mode: context.config.mode,
        });
      }

      if (request.method === "GET" && url.pathname === "/features") {
        return json({
          features: featureMap,
        });
      }

      if (request.method === "GET" && url.pathname === "/runtime/status") {
        const settings = context.services.settings.get();
        return json({
          provider: settings.model.provider,
          model: settings.model.model,
          plugins: {
            openai: Boolean(context.config.openAiApiKey),
            anthropic: Boolean(context.config.anthropicApiKey),
            pdf: true,
            telegram: Boolean(context.config.telegramBotToken),
          },
          gateway: context.services.gatewayConfig,
        });
      }

      if (request.method === "GET" && url.pathname === "/platforms") {
        if (!context.gateway) {
          return json(
            {
              error:
                "Gateway runtime is not attached to this execution context.",
            },
            503,
          );
        }
        return json({
          platforms: (await context.gateway.state(50)).platforms,
        });
      }

      if (request.method === "GET" && url.pathname === "/doctor") {
        return json({
          checks: await context.services.diagnostics.run({
            skillsCount: context.services.skills.list().length,
            contextFilesCount: context.services.contextFiles.list().length,
            recentCronRuns: context.services.cron.recentRuns(5).length,
            recentTerminalCommands: context.services.terminal.recent(5).length,
            repositoryAvailable: context.services.repository.isRepository(),
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/setup/checklist") {
        return json({
          checklist: await context.services.diagnostics.setupChecklist(),
        });
      }

      if (request.method === "GET" && url.pathname === "/setup/summary") {
        return json({
          summary: await context.services.operator.setupSummary(),
        });
      }

      if (request.method === "GET" && url.pathname === "/update/preview") {
        return json({
          update: await context.services.operator.updatePreview(),
        });
      }

      if (request.method === "GET" && url.pathname === "/migrate/sources") {
        return json({
          sources: context.services.operator.migrationSources(),
        });
      }

      if (request.method === "GET" && url.pathname === "/migrate/inspect") {
        const sourcePath = url.searchParams.get("path");
        if (!sourcePath) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          inspection:
            context.services.operator.inspectMigrationSource(sourcePath),
        });
      }

      if (request.method === "POST" && url.pathname === "/migrate/apply") {
        const body = (await request.json()) as {
          path?: string;
          overwrite?: boolean;
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          result: context.services.operator.applyMigration(body.path, {
            overwrite: body.overwrite,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/memory") {
        const target =
          url.searchParams.get("target") === "user" ? "user" : "memory";
        return json({
          target,
          snapshot: context.services.memory.renderSnapshot(target),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions") {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          sessions: context.services.sessions.listSessions(
            !Number.isNaN(limit) && limit > 0 ? limit : 20,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions/summary") {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return json({ error: "sessionId is required" }, 400);
        }
        return json({
          summary: context.services.sessions.summarize(sessionId),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills") {
        return json({
          skills: context.services.skills.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills/generated") {
        return json({
          skills: context.services.skillSynthesis.listGeneratedSkills(),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/skills/generated/detail"
      ) {
        const slug = url.searchParams.get("slug");
        if (!slug) {
          return json({ error: "slug is required" }, 400);
        }
        return json({
          detail: context.services.skillSynthesis.describeGeneratedSkill(slug),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools") {
        return json({
          tools: context.services.tools.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          results: context.services.tools.search(query),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/summary") {
        return json({
          summary: context.services.tools.summary(),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/transports") {
        return json({
          transports: context.services.tools.summary().transports,
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/category") {
        const category = url.searchParams.get("name");
        if (!category) {
          return json({ error: "name is required" }, 400);
        }
        return json({
          category,
          tools: context.services.tools.byCategory(category),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools/detail") {
        const id = url.searchParams.get("id");
        if (!id) {
          return json({ error: "id is required" }, 400);
        }
        return json({
          tool: context.services.tools.get(id),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/status") {
        return json({
          mcp: context.services.mcp.status(),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/tools") {
        return json({
          discovery: await context.services.mcp.discoverTools(),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached") {
        return json({
          tools: context.services.mcp.getCachedTools(),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          tools: context.services.mcp.searchCachedTools(query),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/tool") {
        const name = url.searchParams.get("name");
        if (!name) {
          return json({ error: "name is required" }, 400);
        }
        return json({
          tool: context.services.mcp.getTool(name) ?? null,
          detail: context.services.mcp.describeTool(name),
        });
      }

      if (request.method === "GET" && url.pathname === "/mcp/cached/describe") {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          detail: context.services.mcp.describeCachedTools(
            !Number.isNaN(limit) && limit > 0 ? limit : 20,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/tree") {
        const depth = Number(url.searchParams.get("depth") ?? "2");
        return json({
          entries: context.services.workspace.tree(
            Number.isNaN(depth) ? 2 : depth,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/read") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          path,
          content: context.services.workspace.read(path),
        });
      }

      if (request.method === "GET" && url.pathname === "/workspace/search") {
        const query = url.searchParams.get("query");
        if (!query) {
          return json({ error: "query is required" }, 400);
        }
        return json({
          results: context.services.workspace.search(query),
        });
      }

      if (request.method === "GET" && url.pathname === "/web/fetch") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          page: await context.services.web.fetchText(targetUrl),
        });
      }

      if (request.method === "GET" && url.pathname === "/browser/status") {
        return json({
          browser: await context.services.web.status(),
        });
      }

      if (request.method === "GET" && url.pathname === "/browser/inspect") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          inspection: await context.services.web.inspect(targetUrl),
        });
      }

      if (request.method === "POST" && url.pathname === "/web/snapshot") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          path: await context.services.web.snapshot(body.url),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/screenshot") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          path: await context.services.web.screenshot(body.url),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/capture") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          capture: await context.services.web.capture(body.url),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/analyze") {
        const body = (await request.json()) as { url?: string };
        if (!body.url) {
          return json({ error: "url is required" }, 400);
        }
        const analysis = await context.services.web.analyze(body.url);
        return json({
          analysis,
          response: await runModelAnalysisTurn(
            context,
            analysis.prompt,
            "browser",
            {
              personalityId: context.services.personalities.getActive().id,
            },
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/browser/compare") {
        const body = (await request.json()) as {
          leftUrl?: string;
          rightUrl?: string;
        };
        if (!body.leftUrl || !body.rightUrl) {
          return json({ error: "leftUrl and rightUrl are required" }, 400);
        }
        return json({
          comparison: await context.services.web.compare(
            body.leftUrl,
            body.rightUrl,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/browser/compare/analyze"
      ) {
        const body = (await request.json()) as {
          leftUrl?: string;
          rightUrl?: string;
        };
        if (!body.leftUrl || !body.rightUrl) {
          return json({ error: "leftUrl and rightUrl are required" }, 400);
        }
        const analysis = await context.services.web.analyzeComparison(
          body.leftUrl,
          body.rightUrl,
        );
        return json({
          analysis,
          response: await runModelAnalysisTurn(
            context,
            analysis.prompt,
            "browser-comparison",
            {
              personalityId: context.services.personalities.getActive().id,
            },
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/web/inspect") {
        const targetUrl = url.searchParams.get("url");
        if (!targetUrl) {
          return json({ error: "url is required" }, 400);
        }
        return json({
          inspection: await context.services.web.inspect(targetUrl),
        });
      }

      if (request.method === "GET" && url.pathname === "/media/inspect") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          media: context.services.media.inspect(path),
        });
      }

      if (request.method === "GET" && url.pathname === "/media/transcript") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        const media = context.services.media.inspect(path);
        return json({
          path,
          transcriptPath: media.transcriptPath,
          transcriptPreview: media.transcriptPreview,
        });
      }

      if (request.method === "GET" && url.pathname === "/media/caption") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        const media = context.services.media.inspect(path);
        return json({
          path,
          captionPath: media.captionPath,
          captionPreview: media.captionPreview,
        });
      }

      if (request.method === "GET" && url.pathname === "/media/bundle") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          bundle: context.services.media.bundle(path),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/analyze") {
        const body = (await request.json()) as {
          path?: string;
          focus?: "auto" | "voice" | "vision" | "research";
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          analysis: await context.services.media.analyzeWithModel(
            body.path,
            body.focus ?? "auto",
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/transcribe") {
        const body = (await request.json()) as {
          path?: string;
          language?: string;
          prompt?: string;
          name?: string;
        };
        if (!body.path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          transcription: await context.services.media.transcribeWithModel(
            body.path,
            {
              language: body.language,
              prompt: body.prompt,
              name: body.name,
            },
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/speak") {
        const body = (await request.json()) as {
          text?: string;
          name?: string;
          voice?: string;
          format?: "mp3" | "svg";
          speed?: number;
        };
        if (!body.text) {
          return json({ error: "text is required" }, 400);
        }
        return json({
          speech: await context.services.media.speakWithModel(body.text, {
            name: body.name,
            voice: body.voice,
            format: body.format,
            speed: body.speed,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/media/generate") {
        const body = (await request.json()) as {
          prompt?: string;
          name?: string;
          size?: string;
          style?: string;
          focus?: string;
        };
        if (!body.prompt) {
          return json({ error: "prompt is required" }, 400);
        }
        return json({
          generation: await context.services.media.generateImage(body.prompt, {
            name: body.name,
            size: body.size,
            style: body.style,
            focus: body.focus,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/workspace/write") {
        const body = (await request.json()) as {
          path?: string;
          content?: string;
        };
        if (!body.path || body.content === undefined) {
          return json({ error: "path and content are required" }, 400);
        }
        return json({
          path: context.services.workspace.write(body.path, body.content),
        });
      }

      if (request.method === "GET" && url.pathname === "/deliveries") {
        return json({
          deliveries: context.services.delivery.recent(100),
        });
      }

      if (request.method === "GET" && url.pathname === "/terminal/history") {
        return json({
          commands: context.services.terminal.recent(25),
        });
      }

      if (request.method === "POST" && url.pathname === "/terminal/run") {
        const body = (await request.json()) as {
          command?: string;
          timeoutMs?: number;
        };
        if (!body.command) {
          return json({ error: "command is required" }, 400);
        }
        return json({
          result: await context.services.terminal.run(
            body.command,
            body.timeoutMs,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/tasks") {
        const filters = parseDelegationFilters(url);
        return json({
          tasks: context.services.delegation
            .list({
              group: filters.group,
              profile: filters.profile,
              priority: filters.priority,
              label: filters.label,
              parentTaskId: filters.parentTaskId,
              status: filters.status,
              executionMode: filters.executionMode,
            })
            .slice(0, filters.limit),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/delegation/tasks/")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        const action = parts[4];
        if (!id) {
          return json({ error: "task id is required" }, 400);
        }
        if (!action) {
          return json({
            task: context.services.delegation.get(id),
          });
        }
        if (action === "children") {
          return json({
            children: context.services.delegation.listChildren(id),
          });
        }
        if (action === "tree") {
          return json({
            tree: context.services.delegation.tree(id),
          });
        }
      }

      if (request.method === "GET" && url.pathname === "/delegation/overview") {
        return json({
          overview: context.services.delegation.overview(),
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/groups") {
        const overview = context.services.delegation.overview();
        return json({
          groups: overview.byGroup,
          labels: overview.byLabel,
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/workers") {
        const filters = parseDelegationFilters(url);
        return json({
          overview: context.services.delegation.overview(),
          workers: context.services.delegation.workers(filters.limit, {
            group: filters.group,
            profile: filters.profile,
            priority: filters.priority,
            label: filters.label,
            parentTaskId: filters.parentTaskId,
            status: filters.status,
            executionMode: filters.executionMode,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/delegation/tasks") {
        const body = (await request.json()) as {
          title?: string;
          objective?: string;
          group?: string;
          profile?: string;
          priority?: "low" | "normal" | "high";
          tags?: string[];
          labels?: string[];
          metadata?: Record<string, string>;
          executionMode?: "local" | "delegated";
          maxAttempts?: number;
        };
        if (!body.title || !body.objective) {
          return json({ error: "title and objective are required" }, 400);
        }
        return json({
          task: context.services.delegation.create({
            title: body.title,
            objective: body.objective,
            group: body.group,
            profile: body.profile,
            priority: body.priority,
            tags: body.tags ?? body.labels,
            labels: body.labels ?? body.tags,
            metadata: body.metadata,
            executionMode: body.executionMode,
            maxAttempts: body.maxAttempts,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/delegation/tasks/") &&
        url.pathname.endsWith("/spawn")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        if (!id) {
          return json({ error: "task id is required" }, 400);
        }
        const body = (await request.json()) as {
          title?: string;
          objective?: string;
          group?: string;
          profile?: string;
          priority?: "low" | "normal" | "high";
          tags?: string[];
          labels?: string[];
          metadata?: Record<string, string>;
          executionMode?: "local" | "delegated";
          maxAttempts?: number;
        };
        if (!body.objective) {
          return json({ error: "objective is required" }, 400);
        }
        return json({
          task: context.services.delegation.spawnChild(id, {
            title: body.title ?? "Child task",
            objective: body.objective,
            group: body.group,
            profile: body.profile,
            priority: body.priority,
            tags: body.tags ?? body.labels,
            labels: body.labels ?? body.tags,
            metadata: body.metadata,
            executionMode: body.executionMode,
            maxAttempts: body.maxAttempts,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/delegation/supervise"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          concurrency?: number;
        };
        const report = await context.services.delegation.superviseQueued(
          async (task) =>
            (
              await runDelegationTaskInWorker(context, task.id, {
                assumeRunning: true,
              })
            ).notes.at(-1) ?? "Delegated worker completed.",
          {
            concurrency:
              typeof body.concurrency === "number" && body.concurrency > 0
                ? body.concurrency
                : 2,
            onComplete: async (task) => {
              context.services.skillSynthesis.synthesizeFromTask(task);
            },
          },
        );
        return json({ report });
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/delegation/tasks/")
      ) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        const action = parts[4];
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          note?: string;
          cascadeChildren?: boolean;
        };
        if (!id || !action) {
          return json({ error: "task id and action are required" }, 400);
        }

        if (action === "note") {
          return json({
            task: context.services.delegation.addNote(id, body.note ?? ""),
          });
        }
        if (action === "run") {
          return json({ task: context.services.delegation.markRunning(id) });
        }
        if (action === "execute") {
          const response = await handleAgentTurn(
            {
              message: `/delegate execute ${id}`,
              userId: "api-delegation",
              roomId: "api-delegation",
              source: "api",
            },
            context,
          );
          return json({ result: response });
        }
        if (action === "retry") {
          return json({
            task: context.services.delegation.requeue(
              id,
              body.note ?? "Requeued via API.",
              {
                cascadeChildren: body.cascadeChildren,
              },
            ),
          });
        }
        if (action === "cancel") {
          return json({
            task: context.services.delegation.cancel(
              id,
              body.note ?? "Cancelled via API.",
              {
                cascadeChildren: body.cascadeChildren,
              },
            ),
          });
        }
        if (action === "complete") {
          return json({
            task: context.services.delegation.complete(id, body.note),
          });
        }
        if (action === "fail") {
          return json({
            task: context.services.delegation.fail(
              id,
              body.note ?? "Task failed.",
              {
                cascadeChildren: body.cascadeChildren,
              },
            ),
          });
        }

        return json({ error: "unknown delegation action" }, 404);
      }

      if (request.method === "GET" && url.pathname === "/repo/status") {
        return json({
          status: await context.services.repository.status(),
        });
      }

      if (request.method === "GET" && url.pathname === "/repo/diff") {
        return json({
          diff: await context.services.repository.diffStat(),
        });
      }

      if (request.method === "GET" && url.pathname === "/repo/log") {
        return json({
          log: await context.services.repository.recentCommits(),
        });
      }

      if (request.method === "GET" && url.pathname === "/sessions/gateway") {
        return json({
          sessions: context.services.gatewaySessions.list(),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/sessions/gateway/home"
      ) {
        const platform = url.searchParams.get(
          "platform",
        ) as PlatformName | null;
        if (!platform) {
          return json({ error: "platform is required" }, 400);
        }
        return json({
          sessions: context.services.gatewaySessions.homeForPlatform(platform),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/sessions/gateway/voice"
      ) {
        const body = (await request.json()) as {
          sessionKey?: string;
          mode?: "off" | "voice_only" | "all";
          voiceChannelId?: string;
        };
        if (!body.sessionKey) {
          return json({ error: "sessionKey is required" }, 400);
        }
        let session = context.services.gatewaySessions.get(body.sessionKey);
        if (!session) {
          return json({ error: "session not found" }, 404);
        }
        if (body.mode) {
          session = context.services.gatewaySessions.setVoiceMode(
            body.sessionKey,
            body.mode,
          );
        }
        if (body.voiceChannelId !== undefined) {
          session = context.services.gatewaySessions.setVoiceChannel(
            body.sessionKey,
            body.voiceChannelId || undefined,
          );
        }
        return json({ session });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/sessions/gateway/home"
      ) {
        const body = (await request.json()) as {
          sessionKey?: string;
          isHome?: boolean;
          label?: string;
        };
        if (!body.sessionKey) {
          return json({ error: "sessionKey is required" }, 400);
        }
        return json({
          session: context.services.gatewaySessions.markHome(body.sessionKey, {
            isHome: body.isHome,
            label: body.label,
          }),
        });
      }

      if (request.method === "GET" && url.pathname === "/personality") {
        return json({
          active: context.services.personalities.getActive(),
          available: context.services.personalities.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/users") {
        const userId = url.searchParams.get("userId");
        return json({
          profiles: userId
            ? [context.services.userProfiles.get(userId)]
            : context.services.userProfiles.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/users/card") {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return json({ error: "userId is required" }, 400);
        }
        return json({
          card: context.services.userProfiles.renderCards(userId),
        });
      }

      if (request.method === "GET" && url.pathname === "/profiles/agent") {
        return json({
          profile: context.services.userProfiles.getAgent(),
          card: context.services.userProfiles.renderAgent(),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/note"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          note?: string;
          source?: string;
        };
        if (!body.userId || !body.note) {
          return json({ error: "userId and note are required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.addNote(
            body.userId,
            body.note,
            body.source,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/remember"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          kind?:
            | "preference"
            | "fact"
            | "goal"
            | "context"
            | "constraint"
            | "note"
            | "memory";
          value?: string;
          source?: string;
        };
        if (!body.userId || !body.kind || !body.value) {
          return json({ error: "userId, kind, and value are required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.remember(
            body.userId,
            body.kind,
            body.value,
            body.source,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/users/mode"
      ) {
        const body = (await request.json()) as {
          userId?: string;
          mode?: "local" | "hybrid";
        };
        if (!body.userId || (body.mode !== "local" && body.mode !== "hybrid")) {
          return json({ error: "userId and mode are required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.setMode(
            body.userId,
            body.mode,
          ),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/profiles/agent/observe"
      ) {
        const body = (await request.json()) as {
          note?: string;
          source?: string;
        };
        if (!body.note) {
          return json({ error: "note is required" }, 400);
        }
        return json({
          profile: context.services.userProfiles.observeAgent(
            body.note,
            body.source,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/personality") {
        const body = (await request.json()) as { id: string };
        return json({
          active: context.services.personalities.setActive(body.id),
        });
      }

      if (request.method === "GET" && url.pathname === "/context/files") {
        return json({
          files: context.services.contextFiles.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/settings") {
        return json({
          settings: context.services.settings.get(),
        });
      }

      if (request.method === "GET" && url.pathname === "/execution/status") {
        return json({
          active: context.services.settings.get().execution,
          backends: await context.services.terminal.health(),
        });
      }

      if (request.method === "GET" && url.pathname === "/execution/backends") {
        return json({
          backends: await context.services.terminal.health(),
        });
      }

      if (request.method === "POST" && url.pathname === "/execution/preview") {
        const body = (await request.json()) as {
          command?: string;
          timeoutMs?: number;
        };
        if (!body.command) {
          return json({ error: "command is required" }, 400);
        }
        return json({
          preview: context.services.terminal.preview(
            body.command,
            body.timeoutMs,
          ),
        });
      }

      if (request.method === "POST" && url.pathname === "/settings") {
        const body = (await request.json()) as {
          path: string;
          value: string | number | boolean;
        };
        const settings = context.services.settings.set(body.path, body.value);
        syncProviderSettings(context, settings);
        return json({
          settings,
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/documents/pdf/extract"
      ) {
        const body = (await request.json()) as {
          path?: string;
          base64?: string;
          startPage?: number;
          endPage?: number;
          preserveWhitespace?: boolean;
          cleanContent?: boolean;
        };

        if (!body.path && !body.base64) {
          return json({ error: "path or base64 is required" }, 400);
        }

        const text = body.path
          ? await context.services.documents.extractPdfFromPath(body.path, {
              startPage: body.startPage,
              endPage: body.endPage,
              preserveWhitespace: body.preserveWhitespace,
              cleanContent: body.cleanContent,
            })
          : await context.services.documents.extractPdfFromBase64(
              body.base64 as string,
              {
                startPage: body.startPage,
                endPage: body.endPage,
                preserveWhitespace: body.preserveWhitespace,
                cleanContent: body.cleanContent,
              },
            );

        return json({
          text,
        });
      }

      if (request.method === "GET" && url.pathname === "/cron/jobs") {
        return json({
          jobs: context.services.cron.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/cron/runs") {
        return json({
          runs: context.services.cron.recentRuns(50),
        });
      }

      if (request.method === "POST" && url.pathname === "/cron/jobs") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          name?: string;
          prompt?: string;
          schedule?: string;
          skills?: string[];
          delivery?: "origin" | "local";
          runtime?: {
            provider?: string;
            model?: string;
            baseUrl?: string;
            temperature?: number;
            maxTokens?: number;
            personalityId?: string;
          };
        };
        if (!body.schedule || !body.prompt) {
          return json({ error: "schedule and prompt are required" }, 400);
        }
        return json({
          job: context.services.cron.create({
            name: body.name ?? `job-${Date.now()}`,
            schedule: body.schedule,
            prompt: body.prompt,
            skills: body.skills ?? [],
            delivery: body.delivery ?? "local",
            runtime: body.runtime,
          }),
        });
      }

      if (
        request.method === "PATCH" &&
        url.pathname.startsWith("/cron/jobs/")
      ) {
        const id = url.pathname.replace("/cron/jobs/", "").trim();
        if (!id) {
          return json({ error: "cron job id is required" }, 400);
        }
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          name?: string;
          prompt?: string;
          schedule?: string;
          skills?: string[];
          delivery?: "origin" | "local";
          clearRuntime?: boolean;
          runtime?: {
            provider?: string;
            model?: string;
            baseUrl?: string;
            temperature?: number;
            maxTokens?: number;
            personalityId?: string;
          };
        };

        return json({
          job: context.services.cron.updateConfig(id, {
            name: body.name,
            prompt: body.prompt,
            schedule: body.schedule,
            skills: body.skills,
            delivery: body.delivery,
            clearRuntime: body.clearRuntime,
            runtime: body.runtime,
          }),
        });
      }

      if (request.method === "POST" && url.pathname === "/skills/synthesize") {
        const body = (await request.json()) as { taskId?: string };
        if (!body.taskId) {
          return json({ error: "taskId is required" }, 400);
        }
        const task = context.services.delegation
          .list()
          .find((entry) => entry.id === body.taskId);
        if (!task) {
          return json({ error: "Delegation task not found" }, 404);
        }
        return json({
          path: context.services.skillSynthesis.synthesizeFromTask(task),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/export"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json({
          path: context.services.trajectories.exportDataset({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            mode: body.mode,
            notes: body.notes,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/bundle"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json(
          context.services.trajectories.exportFilteredBundle({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            mode: body.mode,
            notes: body.notes,
          }),
        );
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/replay"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          manifestPath?: string;
          label?: string;
          latest?: boolean;
        };
        if (body.latest) {
          const replay = context.services.trajectories.replayLatest();
          return replay
            ? json({ replay })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (!body.manifestPath && !body.label) {
          return json({ error: "manifestPath or label is required" }, 400);
        }
        const bundles = context.services.trajectories.listBundles(50);
        const manifestPath =
          body.manifestPath ??
          bundles.find(
            (entry) =>
              entry.label === body.label ||
              entry.manifestPath.endsWith(body.label ?? ""),
          )?.manifestPath;
        if (!manifestPath) {
          return json({ error: "Trajectory bundle not found." }, 404);
        }
        return json({
          replay: context.services.trajectories.replayBundle(manifestPath),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/bundles"
      ) {
        const limitRaw = url.searchParams.get("limit");
        const limit = limitRaw ? Number(limitRaw) : 20;
        return json({
          bundles: context.services.trajectories.listBundles(
            !Number.isNaN(limit) && limit > 0 ? limit : 20,
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/trajectories/replay") {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const replay = context.services.trajectories.replayLatest();
          return replay
            ? json({ replay })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          return json({
            replay: context.services.trajectories.replayBundle(manifestPath),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            replay: context.services.trajectories.replayBundle(
              bundle.manifestPath,
            ),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/replay/latest"
      ) {
        const replay = context.services.trajectories.replayLatest();
        return replay
          ? json({ replay })
          : json({ error: "No trajectory bundles recorded." }, 404);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/analyze"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          purpose?: string;
          tags?: string[];
          mode?: "dataset" | "research" | "evaluation" | "rl";
          notes?: string;
        };
        return json({
          analysis: context.services.trajectories.analyze({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            purpose: body.purpose,
            tags: body.tags,
            mode: body.mode,
            notes: body.notes,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/evaluate"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          rubric?: string[];
          tags?: string[];
          purpose?: string;
          notes?: string;
          mode?: "dataset" | "research" | "evaluation" | "rl";
        };
        return json({
          evaluation: await context.services.trajectories.evaluate({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            rubric: body.rubric,
            tags: body.tags,
            purpose: body.purpose,
            notes: body.notes,
            mode: body.mode,
          }),
        });
      }

      if (
        request.method === "POST" &&
        url.pathname === "/trajectories/package"
      ) {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as {
          limit?: number;
          sessionId?: string;
          role?: "user" | "assistant" | "system";
          label?: string;
          rubric?: string[];
          tags?: string[];
          purpose?: string;
          notes?: string;
          mode?: "dataset" | "research" | "evaluation" | "rl";
        };
        return json({
          package: await context.services.trajectories.package({
            limit: body.limit ?? 200,
            sessionId: body.sessionId,
            role: body.role,
            label: body.label,
            rubric: body.rubric,
            tags: body.tags,
            purpose: body.purpose,
            notes: body.notes,
            mode: body.mode,
          }),
        });
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/evaluate"
      ) {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const evaluation =
            await context.services.trajectories.evaluateLatest();
          return evaluation
            ? json({ evaluation })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          return json({
            evaluation:
              await context.services.trajectories.evaluateBundle(manifestPath),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            evaluation: await context.services.trajectories.evaluateBundle(
              bundle.manifestPath,
            ),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (
        request.method === "GET" &&
        url.pathname === "/trajectories/package"
      ) {
        const manifestPath = url.searchParams.get("manifestPath");
        const label = url.searchParams.get("label");
        const latest = url.searchParams.get("latest") === "true";
        if (latest) {
          const packaged = await context.services.trajectories.packageLatest();
          return packaged
            ? json({ package: packaged })
            : json({ error: "No trajectory bundles recorded." }, 404);
        }
        if (manifestPath) {
          const bundle =
            context.services.trajectories.describeBundle(manifestPath);
          return json({
            package: await context.services.trajectories.package({
              limit: bundle.limit,
              sessionId: bundle.filters?.sessionId ?? undefined,
              role: bundle.filters?.role ?? undefined,
              label: bundle.label,
              purpose: bundle.purpose,
              mode: bundle.mode,
              tags: bundle.tags,
              notes: bundle.notes,
            }),
          });
        }
        if (label) {
          const bundle = context.services.trajectories
            .listBundles(50)
            .find((entry) => entry.label === label);
          if (!bundle) {
            return json({ error: "Trajectory bundle not found." }, 404);
          }
          return json({
            package: await context.services.trajectories.package({
              limit: bundle.limit,
              sessionId: bundle.filters?.sessionId ?? undefined,
              role: bundle.filters?.role ?? undefined,
              label: bundle.label,
              purpose: bundle.purpose,
              mode: bundle.mode,
              tags: bundle.tags,
              notes: bundle.notes,
            }),
          });
        }
        return json(
          { error: "manifestPath, label, or latest=true is required" },
          400,
        );
      }

      if (request.method === "POST" && url.pathname === "/mcp/probe") {
        return json({
          probe: await context.services.mcp.probe(),
        });
      }

      if (request.method === "POST" && url.pathname === "/mcp/invoke") {
        const body = (await request.json()) as { input?: string };
        if (!body.input) {
          return json({ error: "input is required" }, 400);
        }
        return json({
          result: await context.services.mcp.invoke(body.input),
        });
      }

      if (request.method === "POST" && url.pathname === "/mcp/invoke-tool") {
        const body = (await request.json()) as {
          tool?: string;
          input?: Record<string, unknown>;
        };
        if (!body.tool) {
          return json({ error: "tool is required" }, 400);
        }
        return json({
          result: await context.services.mcp.invokeTool(
            body.tool,
            body.input ?? {},
          ),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/config") {
        return json({
          gateway: loadGatewayConfig(context.config),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/config") {
        const body = (await request.json()) as GatewayConfig;
        saveGatewayConfig(context.config, body);
        context.services.gatewayConfig = body;
        context.services.diagnostics = new DiagnosticsService(
          context.config,
          body,
        );
        return json({ ok: true, gateway: body });
      }

      if (request.method === "GET" && url.pathname === "/gateway/health") {
        const readiness = await context.gateway.health();
        const history = await context.gateway.history(25);
        return json({
          health: readiness,
          readiness,
          state: history.state,
          traces: history.traces,
          inbox: history.inbox,
          outbox: history.outbox,
          attachments: history.attachments,
          deliveries: history.deliveries,
          sessions: context.services.gatewaySessions.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/trace") {
        const filters = parseGatewayFilters(url);
        const history = await context.gateway.history(filters.limit, filters);
        return json({
          traces: history.traces,
          state: history.state,
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/deliveries") {
        const filters = parseGatewayFilters(url);
        const history = await context.gateway.history(filters.limit, filters);
        return json({
          deliveries: history.deliveries,
          state: history.state,
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/inbox") {
        const filters = parseGatewayFilters(url);
        return json({
          inbox: context.gateway.inbox(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/outbox") {
        const filters = parseGatewayFilters(url);
        return json({
          outbox: context.gateway.outbox(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/attachments") {
        const filters = parseGatewayFilters(url);
        return json({
          attachments: context.gateway.attachments(filters.limit, filters),
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/history") {
        const filters = parseGatewayFilters(url);
        return json({
          history: await context.gateway.history(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/state") {
        const filters = parseGatewayFilters(url);
        return json({
          state: await context.gateway.state(filters.limit, filters),
        });
      }

      if (request.method === "GET" && url.pathname === "/gateway/runtime") {
        return json({
          runtime: context.gateway.runtimeStatus(),
        });
      }

      if (request.method === "POST" && url.pathname === "/gateway/start") {
        await context.gateway.start();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/gateway/stop") {
        await context.gateway.stop();
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/gateway/message") {
        const parsed = await parseJsonBody<IncomingPlatformMessage>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        const result = await context.gateway.receive(parsed.value);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/telegram") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("telegram", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/discord") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("discord", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/slack") {
        const rawBody = await request.text();
        if (
          !verifySlackSignature(
            rawBody,
            request.headers.get("x-slack-request-timestamp"),
            request.headers.get("x-slack-signature"),
            context.config.slackSigningSecret,
          )
        ) {
          return json({ error: "Invalid Slack signature." }, 403);
        }

        let body: {
          challenge?: string;
          event?: unknown;
        };
        try {
          body = JSON.parse(rawBody) as typeof body;
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }
        if (body.challenge) {
          return json({ challenge: body.challenge });
        }
        const inbound = normalizeInboundMessage("slack", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (
          mode === "subscribe" &&
          token &&
          challenge &&
          token === context.config.whatsappVerifyToken
        ) {
          return new Response(challenge, { status: 200 });
        }
        return json({ error: "WhatsApp verification failed." }, 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
        const body = (await request.json().catch(() => null)) as unknown;
        if (!body) {
          return json({ error: "Invalid JSON body." }, 400);
        }
        const inbound = normalizeInboundMessage("whatsapp", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/signal") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("signal", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/matrix") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("matrix", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/email") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("email", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/sms") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("sms", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/webhooks/mattermost"
      ) {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("mattermost", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (
        request.method === "POST" &&
        url.pathname === "/webhooks/homeassistant"
      ) {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("homeassistant", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/dingtalk") {
        const body = (await request.json().catch(() => null)) as unknown;
        const inbound = normalizeInboundMessage("dingtalk", body);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "GET" && url.pathname === "/pairing/pending") {
        const platform = url.searchParams.get(
          "platform",
        ) as PlatformName | null;
        return json({
          requests: context.services.pairing.listPending(platform ?? undefined),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/approve") {
        const body = (await request.json()) as {
          platform: PlatformName;
          code: string;
        };
        return json({
          approved: context.services.pairing.approve(body.platform, body.code),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/deny") {
        const body = (await request.json()) as {
          platform: PlatformName;
          code: string;
        };
        return json({
          denied: context.services.pairing.deny(body.platform, body.code),
        });
      }

      if (request.method === "GET" && url.pathname === "/hooks") {
        return json({
          hooks: context.services.hooks.list(),
          recentInvocations: context.services.hooks.recentInvocations(),
        });
      }

      if (request.method === "POST" && url.pathname === "/hooks") {
        const body = (await request.json()) as {
          event: string;
          name: string;
          enabled?: boolean;
          template: string;
        };
        return json({
          hook: context.services.hooks.add({
            event: body.event,
            name: body.name,
            enabled: body.enabled ?? true,
            template: body.template,
          }),
        });
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/hooks/")) {
        const id = url.pathname.replace("/hooks/", "");
        context.services.hooks.remove(id);
        return json({ ok: true });
      }

      if (request.method === "POST" && url.pathname === "/chat") {
        const body = (await request.json()) as {
          message?: string;
          userId?: string;
          roomId?: string;
          source?: string;
        };

        if (!body.message) {
          return json({ error: "message is required" }, 400);
        }

        const response = await handleAgentTurn(
          {
            message: body.message,
            userId: body.userId ?? "api-user",
            roomId: body.roomId,
            source: body.source ?? "api",
          },
          context,
        );

        return json({
          response,
          character: context.config.agentName,
        });
      }

      return json({ error: "Not found" }, 404);
    },
  });
}
