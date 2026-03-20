import type { AppContext } from "@/runtime/bootstrap";
import { loadGatewayConfig, saveGatewayConfig } from "@/config/gateway";
import { featureMap } from "@/config/feature-map";
import { handleAgentTurn, syncProviderSettings } from "@/runtime/chat";
import { DiagnosticsService } from "@/services/diagnostics-service";
import type { GatewayConfig, IncomingPlatformMessage, PlatformName } from "@/types";
import { createHmac, timingSafeEqual } from "node:crypto";

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

async function parseJsonBody<T>(request: Request): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
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

function parseSlackEvent(body: {
  challenge?: string;
  event?: {
    type?: string;
    subtype?: string;
    text?: string;
    channel?: string;
    user?: string;
    ts?: string;
    thread_ts?: string;
    channel_type?: string;
  };
}): IncomingPlatformMessage | null {
  if (
    body.event?.type !== "message" ||
    body.event.subtype === "bot_message" ||
    !body.event.text ||
    !body.event.channel ||
    !body.event.user
  ) {
    return null;
  }

  return {
    platform: "slack",
    userId: body.event.user,
    roomId: body.event.channel,
    text: body.event.text,
    channelId: body.event.channel,
    messageId: body.event.ts,
    threadId: body.event.thread_ts,
    channelType: body.event.channel_type,
    metadata: {
      eventType: body.event.type,
      ...(body.event.subtype ? { subtype: body.event.subtype } : {}),
    },
  };
}

function parseDiscordMessage(body: {
  content?: string;
  channel_id?: string;
  id?: string;
  author?: { id?: string; username?: string; bot?: boolean };
  message_reference?: { message_id?: string };
  guild_id?: string;
  type?: number;
}): IncomingPlatformMessage | null {
  if (!body.content || !body.channel_id || !body.author?.id || body.author.bot) {
    return null;
  }

  return {
    platform: "discord",
    userId: body.author.id,
    roomId: body.channel_id,
    text: body.content,
    channelId: body.channel_id,
    messageId: body.id,
    replyToMessageId: body.message_reference?.message_id,
    metadata: {
      ...(body.author.username ? { authorUsername: body.author.username } : {}),
      ...(body.guild_id ? { guildId: body.guild_id } : {}),
      ...(typeof body.type === "number" ? { messageType: String(body.type) } : {}),
    },
  };
}

function parseTelegramMessage(body: {
  message?: {
    message_id?: number;
    text?: string;
    chat?: { id?: number | string; type?: string; title?: string };
    from?: { id?: number | string; username?: string; first_name?: string; last_name?: string };
    reply_to_message?: { message_id?: number };
    date?: number;
  };
}): IncomingPlatformMessage | null {
  if (!body.message?.text || body.message.chat?.id === undefined || body.message.from?.id === undefined) {
    return null;
  }

  return {
    platform: "telegram",
    userId: String(body.message.from.id),
    roomId: String(body.message.chat.id),
    text: body.message.text,
    channelId: String(body.message.chat.id),
    threadId: body.message.reply_to_message?.message_id
      ? String(body.message.reply_to_message.message_id)
      : undefined,
    messageId: body.message.message_id ? String(body.message.message_id) : undefined,
    replyToMessageId: body.message.reply_to_message?.message_id
      ? String(body.message.reply_to_message.message_id)
      : undefined,
    channelType: body.message.chat.type,
    authorName:
      body.message.from.username ??
      (
        [body.message.from.first_name, body.message.from.last_name]
          .filter(Boolean)
          .join(" ")
          .trim() || undefined
      ),
    timestamp: body.message.date ? new Date(body.message.date * 1000).toISOString() : undefined,
    metadata: {
      ...(body.message.chat.title ? { chatTitle: body.message.chat.title } : {}),
      ...(body.message.chat.type ? { chatType: body.message.chat.type } : {}),
    },
  };
}

function parseWhatsAppMessage(body: {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          context?: { id?: string };
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}): IncomingPlatformMessage | null {
  const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message?.from || !message.text?.body) {
    return null;
  }

  return {
    platform: "whatsapp",
    userId: message.from,
    roomId: message.from,
    text: message.text.body,
    channelId: message.from,
    messageId: message.id,
    replyToMessageId: message.context?.id,
    timestamp: message.timestamp,
    metadata: {
      ...(message.context?.id ? { replyToId: message.context.id } : {}),
    },
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

      if (request.method === "GET" && url.pathname === "/memory") {
        const target = url.searchParams.get("target") === "user" ? "user" : "memory";
        return json({
          target,
          snapshot: context.services.memory.renderSnapshot(target),
        });
      }

      if (request.method === "GET" && url.pathname === "/skills") {
        return json({
          skills: context.services.skills.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/tools") {
        return json({
          tools: context.services.tools.list(),
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

      if (request.method === "GET" && url.pathname === "/workspace/tree") {
        const depth = Number(url.searchParams.get("depth") ?? "2");
        return json({
          entries: context.services.workspace.tree(Number.isNaN(depth) ? 2 : depth),
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

      if (request.method === "GET" && url.pathname === "/media/inspect") {
        const path = url.searchParams.get("path");
        if (!path) {
          return json({ error: "path is required" }, 400);
        }
        return json({
          media: context.services.media.inspect(path),
        });
      }

      if (request.method === "POST" && url.pathname === "/workspace/write") {
        const body = (await request.json()) as { path?: string; content?: string };
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
        const body = (await request.json()) as { command?: string; timeoutMs?: number };
        if (!body.command) {
          return json({ error: "command is required" }, 400);
        }
        return json({
          result: await context.services.terminal.run(body.command, body.timeoutMs),
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/tasks") {
        return json({
          tasks: context.services.delegation.list(),
        });
      }

      if (request.method === "GET" && url.pathname === "/delegation/workers") {
        return json({
          tasks: context.services.delegation
            .list()
            .filter((task) => task.workerMode === "process" || task.workerPid || task.lastOutputPath),
        });
      }

      if (request.method === "POST" && url.pathname === "/delegation/tasks") {
        const body = (await request.json()) as {
          title?: string;
          objective?: string;
          executionMode?: "local" | "delegated";
        };
        if (!body.title || !body.objective) {
          return json({ error: "title and objective are required" }, 400);
        }
        return json({
          task: context.services.delegation.create({
            title: body.title,
            objective: body.objective,
            executionMode: body.executionMode,
          }),
        });
      }

      if (request.method === "POST" && url.pathname.startsWith("/delegation/tasks/")) {
        const parts = url.pathname.split("/");
        const id = parts[3];
        const action = parts[4];
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { note?: string };
        if (!id || !action) {
          return json({ error: "task id and action are required" }, 400);
        }

        if (action === "note") {
          return json({ task: context.services.delegation.addNote(id, body.note ?? "") });
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
        if (action === "complete") {
          return json({ task: context.services.delegation.complete(id, body.note) });
        }
        if (action === "fail") {
          return json({
            task: context.services.delegation.fail(id, body.note ?? "Task failed."),
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

      if (request.method === "GET" && url.pathname === "/personality") {
        return json({
          active: context.services.personalities.getActive(),
          available: context.services.personalities.list(),
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

      if (request.method === "POST" && url.pathname === "/settings") {
        const body = (await request.json()) as { path: string; value: string | number | boolean };
        const settings = context.services.settings.set(body.path, body.value);
        syncProviderSettings(context, settings);
        return json({
          settings,
        });
      }

      if (request.method === "POST" && url.pathname === "/documents/pdf/extract") {
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
          : await context.services.documents.extractPdfFromBase64(body.base64 as string, {
              startPage: body.startPage,
              endPage: body.endPage,
              preserveWhitespace: body.preserveWhitespace,
              cleanContent: body.cleanContent,
            });

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

      if (request.method === "POST" && url.pathname === "/skills/synthesize") {
        const body = (await request.json()) as { taskId?: string };
        if (!body.taskId) {
          return json({ error: "taskId is required" }, 400);
        }
        const task = context.services.delegation.list().find((entry) => entry.id === body.taskId);
        if (!task) {
          return json({ error: "Delegation task not found" }, 404);
        }
        return json({
          path: context.services.skillSynthesis.synthesizeFromTask(task),
        });
      }

      if (request.method === "POST" && url.pathname === "/trajectories/export") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { limit?: number };
        return json({
          path: context.services.trajectories.exportRecent(body.limit ?? 200),
        });
      }

      if (request.method === "POST" && url.pathname === "/trajectories/bundle") {
        const body = ((await request.json().catch(() => ({}))) ?? {}) as { limit?: number };
        return json(context.services.trajectories.exportBundle(body.limit ?? 200));
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
          result: await context.services.mcp.invokeTool(body.tool, body.input ?? {}),
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
        context.services.diagnostics = new DiagnosticsService(context.config, body);
        return json({ ok: true, gateway: body });
      }

      if (request.method === "GET" && url.pathname === "/gateway/health") {
        const readiness = await context.gateway.health();
        return json({
          health: readiness,
          readiness,
          sessions: context.services.gatewaySessions.list(),
          deliveries: context.services.delivery.recent(20),
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
        const parsed = await parseJsonBody<{
          message?: {
            text?: string;
            chat?: { id?: number | string };
            from?: { id?: number | string };
          };
        }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        const inbound = parseTelegramMessage(parsed.value);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "POST" && url.pathname === "/webhooks/discord") {
        const parsed = await parseJsonBody<{
          content?: string;
          channel_id?: string;
          id?: string;
          author?: { id?: string; username?: string; bot?: boolean };
          message_reference?: { message_id?: string };
          guild_id?: string;
          type?: number;
        }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        const inbound = parseDiscordMessage(parsed.value);
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
          event?: {
            type?: string;
            subtype?: string;
            text?: string;
            channel?: string;
            user?: string;
            ts?: string;
            thread_ts?: string;
            channel_type?: string;
          };
        };
        try {
          body = JSON.parse(rawBody) as typeof body;
        } catch {
          return json({ error: "Invalid JSON body." }, 400);
        }
        if (body.challenge) {
          return json({ challenge: body.challenge });
        }
        const inbound = parseSlackEvent(body);
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
        const parsed = await parseJsonBody<{
          entry?: Array<{
            changes?: Array<{
              value?: {
                messages?: Array<{
                  id?: string;
                  from?: string;
                  timestamp?: string;
                  context?: { id?: string };
                  text?: { body?: string };
                }>;
              };
            }>;
          }>;
        }>(request);
        if (!parsed.ok) {
          return parsed.response;
        }
        const inbound = parseWhatsAppMessage(parsed.value);
        if (!inbound) {
          return json({ ok: true, ignored: true });
        }
        const result = await context.gateway.receive(inbound);
        return json(result, result.ok ? 200 : 403);
      }

      if (request.method === "GET" && url.pathname === "/pairing/pending") {
        const platform = url.searchParams.get("platform") as PlatformName | null;
        return json({
          requests: context.services.pairing.listPending(platform ?? undefined),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/approve") {
        const body = (await request.json()) as { platform: PlatformName; code: string };
        return json({
          approved: context.services.pairing.approve(body.platform, body.code),
        });
      }

      if (request.method === "POST" && url.pathname === "/pairing/deny") {
        const body = (await request.json()) as { platform: PlatformName; code: string };
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
