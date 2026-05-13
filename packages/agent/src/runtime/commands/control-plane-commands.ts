import { renderCommandCatalog } from "@/runtime/command-catalog";
import { displayCommand } from "@/runtime/commands/command-execution";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";

function compact(value: string | undefined, maxLength: number): string {
  const normalized = (value ?? "").replace(/\s+/gu, " ").trim();
  if (!normalized) {
    return "none";
  }
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 3)}...`
    : normalized;
}

function safeRead<T>(reader: () => T): T | undefined {
  try {
    return reader();
  } catch {
    return undefined;
  }
}

function renderRecentConversation(
  context: AgentExecutionContext,
  sessionKey: string,
): string[] {
  const recent =
    safeRead(() => context.services.sessions.recentBySession(sessionKey, 4)) ??
    [];
  const chronological = recent
    .filter((row) => row.role !== "system")
    .reverse()
    .slice(-3);

  if (!chronological.length) {
    return ["Recent: none yet"];
  }

  return [
    "Recent:",
    ...chronological.map((row) => `  ${row.role}: ${compact(row.text, 96)}`),
  ];
}

function renderProfilePulse(
  context: AgentExecutionContext,
  userId: string,
): string {
  const profiles = safeRead(() => context.services.userProfiles.list()) ?? [];
  const profile = profiles.find((entry) => entry.userId === userId);
  if (!profile) {
    return "Profile: new";
  }
  const displayName = profile.displayName ?? profile.userId;
  return `Profile: ${displayName} facts=${profile.facts.length} prefs=${profile.preferences.length} notes=${profile.notes.length}`;
}

function renderOperatorPulse(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): string {
  const sessionKey = input.roomId ?? `room:${input.userId}`;
  const settings = safeRead(() => context.services.settings.get());
  const personality = safeRead(() =>
    context.services.personalities.getActive(),
  );
  const usage = safeRead(() => context.services.sessions.usage(sessionKey));
  const startup = safeRead(() => context.services.startupState.getSnapshot());
  const activeRun = safeRead(() =>
    context.services.runController.getActive(sessionKey),
  );
  const recentTrajectoryCount =
    safeRead(() => context.services.trajectories.recentEvents(5).length) ?? 0;

  const provider = settings?.model.provider ?? "unknown";
  const model = settings?.model.model ?? "unknown";
  const runDepth = settings?.agent.runDepth ?? "unknown";
  const runCap = settings?.agent.maxIterations ?? "unknown";
  const progress = settings?.agent.toolProgressMode ?? "unknown";
  const startupLine = startup
    ? `Startup: hotPath=${startup.hotPathReady ? "ready" : "warming"} deferred=${startup.deferredReady ? "ready" : "warming"}`
    : "Startup: unknown";
  const runLine = activeRun
    ? `Run: ${activeRun.status} steps=${activeRun.observedActionCount}${activeRun.activeAction ? ` active=${activeRun.activeAction}` : ""}`
    : `Run: idle depth=${runDepth} cap=${runCap} progress=${progress}`;
  const sessionLine = usage
    ? `Session: ${usage.messageCount} messages, ${usage.estimatedTokens} est tokens, last=${compact(usage.lastPreview, 96)}`
    : `Session: ${sessionKey} new`;

  return [
    "Doolittle pulse",
    `Agent: ${context.config.agentName}`,
    `Provider: ${provider} / ${model}`,
    `Personality: ${personality?.name ?? "unknown"}`,
    runLine,
    startupLine,
    sessionLine,
    renderProfilePulse(context, input.userId),
    `Trajectories: ${recentTrajectoryCount} recent events`,
    ...renderRecentConversation(context, sessionKey),
    "Next: /retry | /undo | /todo list | /status | /trajectories list",
  ].join("\n");
}

export async function handleControlPlaneCommand(
  input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  if (trimmed === "/pulse" || trimmed === "/now") {
    return renderOperatorPulse(input, context);
  }

  if (trimmed === "/commands") {
    return renderCommandCatalog(undefined, 80, context.config.workspaceDir);
  }

  if (trimmed.startsWith("/commands search ")) {
    const query = trimmed.replace("/commands search ", "").trim();
    return query
      ? renderCommandCatalog(query, 80, context.config.workspaceDir)
      : "Usage: /commands search <query>";
  }

  if (trimmed === "/gateway start") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    await context.gateway.start();
    return "Gateway started.";
  }

  if (trimmed === "/gateway stop") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    await context.gateway.stop();
    return "Gateway stopped.";
  }

  if (trimmed === "/gateway status") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    return JSON.stringify(await context.gateway.health(), null, 2);
  }

  if (trimmed === "/responses list") {
    return JSON.stringify(context.services.apiTransport.list(20), null, 2);
  }

  if (trimmed.startsWith("/responses show ")) {
    const id = trimmed.replace("/responses show ", "").trim();
    if (!id) {
      return `Usage: ${displayCommand("/responses show <id>")}`;
    }
    return JSON.stringify(
      context.services.apiTransport.get(id) ?? {
        error: `Response ${id} not found.`,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/pdf extract ")) {
    const path = trimmed.replace("/pdf extract ", "").trim();
    if (!path) {
      return `Usage: ${displayCommand("/pdf extract <path>")}`;
    }
    return context.services.documents.extractPdfFromPath(path);
  }

  if (trimmed.startsWith("/gateway receive ")) {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const payload = trimmed.replace("/gateway receive ", "");
    const [head, text] = payload.split("::").map((part) => part.trim());
    const [platform, userId, roomId] = head.split(/\s+/u);
    if (!platform || !userId || !roomId || !text) {
      return `Usage: ${displayCommand("/gateway receive <platform> <userId> <roomId> :: <message>")}`;
    }
    return JSON.stringify(
      await context.gateway.receive({
        platform: platform as never,
        userId,
        roomId,
        text,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/pairing pending") {
    return JSON.stringify(context.services.pairing.listPending(), null, 2);
  }

  if (trimmed.startsWith("/pairing approve ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    return JSON.stringify(
      context.services.pairing.approve(platform as never, code),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/pairing deny ")) {
    const [, , platform, code] = trimmed.split(/\s+/u);
    return JSON.stringify(
      context.services.pairing.deny(platform as never, code),
      null,
      2,
    );
  }

  if (trimmed === "/hooks list") {
    return JSON.stringify(context.services.hooks.list(), null, 2);
  }

  if (trimmed.startsWith("/hooks add ")) {
    const payload = trimmed.replace("/hooks add ", "");
    const [head, template] = payload.split("::").map((part) => part.trim());
    const [event, ...nameParts] = head.split(/\s+/u);
    const name = nameParts.join(" ") || event;
    if (!event || !template) {
      return `Usage: ${displayCommand("/hooks add <event> <name?> :: <template>")}`;
    }
    return JSON.stringify(
      context.services.hooks.add({
        event,
        name,
        enabled: true,
        template,
      }),
      null,
      2,
    );
  }

  if (trimmed === "/hooks recent") {
    return JSON.stringify(context.services.hooks.recentInvocations(), null, 2);
  }

  if (trimmed === "/sessions gateway") {
    return JSON.stringify(context.services.gatewaySessions.list(), null, 2);
  }

  return undefined;
}
