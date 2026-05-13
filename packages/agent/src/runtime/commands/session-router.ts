import { randomUUID } from "node:crypto";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";
import type { ChatCommandRouterDependencies } from "../chat-command-router/types";

function buildCompressionPrompt(input: {
  focus: string;
  middleTurns: Array<{ role: string; text: string }>;
}): string {
  const transcript = input.middleTurns
    .map((message) => `[${message.role.toUpperCase()}] ${message.text}`)
    .join("\n\n");
  return [
    "You are compressing a Doolittle conversation so the active session can continue with less context pressure.",
    "Summarize the replaced turns as durable handoff context.",
    "Preserve user preferences, names, decisions, commands, code changes, tool results, open tasks, and unresolved questions.",
    input.focus
      ? `Compression focus: ${input.focus}`
      : "Compression focus: preserve the operational state needed to continue naturally.",
    "",
    "CONVERSATION TO COMPRESS:",
    "---",
    transcript,
    "---",
    "",
    "Write a concise but complete continuation summary:",
  ].join("\n");
}

async function handleConversationCompression(
  trimmed: string,
  sessionKey: string,
  context: AgentExecutionContext,
  dependencies: ChatCommandRouterDependencies,
): Promise<string | undefined> {
  if (trimmed !== "/compress" && !trimmed.startsWith("/compress ")) {
    return undefined;
  }

  const focus = trimmed.startsWith("/compress ")
    ? trimmed.replace("/compress ", "").trim()
    : "";
  const messages = context.services.sessions.messagesBySession(sessionKey, 500);
  if (messages.length < 4) {
    return "Not enough conversation to compress yet. I need at least 4 stored messages in this session.";
  }

  const leading = messages.slice(0, 1);
  const recent = messages.slice(-3);
  const middleTurns = messages.slice(1, -3);
  if (!middleTurns.length) {
    return "Not enough middle context to compress without losing the live edge of the conversation.";
  }

  const before = context.services.contextCompression.measure(messages);
  const summary = (
    await dependencies.runAnalysis(
      buildCompressionPrompt({ focus, middleTurns }),
      "manual-context-compression",
    )
  ).trim();
  const now = new Date().toISOString();
  const summaryMessage = {
    id: randomUUID(),
    sessionId: sessionKey,
    roomId: messages[0]?.roomId ?? sessionKey,
    entityId: "system",
    role: "system" as const,
    text: [
      "[CONTEXT SUMMARY - manual /compress]",
      focus ? `Focus: ${focus}` : undefined,
      "",
      summary ||
        "Earlier conversation was compressed; no summary text returned.",
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
    createdAt: now,
  };
  const compressed = [...leading, summaryMessage, ...recent].map(
    (message, index) => ({
      ...message,
      createdAt:
        index === 0
          ? message.createdAt
          : new Date(Date.parse(now) + index).toISOString(),
    }),
  );
  context.services.sessions.replaceSessionMessages(sessionKey, compressed);
  const after = context.services.contextCompression.measure(compressed);
  context.services.trajectories.recordEvent({
    category: "run",
    event: "session.compressed",
    sessionId: sessionKey,
    source: "cli",
    text: `[session:compressed] messages=${messages.length}->${compressed.length} tokens=${before.estimatedTokens}->${after.estimatedTokens}`,
    metadata: {
      focus,
      messagesBefore: messages.length,
      messagesAfter: compressed.length,
      tokensBefore: before.estimatedTokens,
      tokensAfter: after.estimatedTokens,
    },
  });

  return [
    "Context compressed for the active session.",
    `Messages: ${messages.length} -> ${compressed.length}`,
    `Estimated tokens: ${before.estimatedTokens.toLocaleString()} -> ${after.estimatedTokens.toLocaleString()}`,
    focus ? `Focus: ${focus}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "n/a";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = ms / 1000;
  return seconds < 60
    ? `${seconds.toFixed(1)}s`
    : `${Math.round(seconds / 60)}m`;
}

function formatOperatorUsage(
  sessionKey: string,
  context: AgentExecutionContext,
): string {
  const usage = context.services.sessions.usage(sessionKey);
  const messages = context.services.sessions.messagesBySession(sessionKey, 500);
  const contextStats = context.services.contextCompression.measure(messages);
  const pct = Math.round(contextStats.usageFraction * 100);
  const trajectoryEvents = context.services.trajectories
    .recentEvents(200)
    .filter((event) => event.sessionId === sessionKey);
  const runEvents = trajectoryEvents.filter((event) =>
    String(event.event).startsWith("run."),
  );
  const toolEvents = trajectoryEvents.filter(
    (event) => event.category === "tool",
  );
  const completedRuns = runEvents
    .map(
      (event) =>
        (
          event.metadata as
            | {
                run?: {
                  startedAt?: string;
                  endedAt?: string;
                  observedActionCount?: number;
                };
              }
            | undefined
        )?.run,
    )
    .filter(
      (
        run,
      ): run is {
        startedAt?: string;
        endedAt?: string;
        observedActionCount?: number;
      } => Boolean(run?.startedAt && run?.endedAt),
    );
  const durations = completedRuns.map(
    (run) => Date.parse(run.endedAt ?? "") - Date.parse(run.startedAt ?? ""),
  );
  const avgDuration =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 0;
  const lastRun = completedRuns.at(-1);

  return [
    "SESSION USAGE",
    `session: ${usage.sessionId}`,
    usage.title ? `title: ${usage.title}` : undefined,
    `messages: ${usage.messageCount} (${usage.userMessages} user / ${usage.assistantMessages} assistant / ${usage.systemMessages} system)`,
    `characters: ${usage.characterCount.toLocaleString()}`,
    `estimated tokens: ${usage.estimatedTokens.toLocaleString()}`,
    `context pressure: ${contextStats.estimatedTokens.toLocaleString()} / ${contextStats.contextWindowTokens.toLocaleString()} (${pct}%)`,
    `runs observed: ${completedRuns.length}`,
    `last run: ${lastRun ? formatDuration(Date.parse(lastRun.endedAt ?? "") - Date.parse(lastRun.startedAt ?? "")) : "n/a"}`,
    `average run: ${durations.length ? formatDuration(avgDuration) : "n/a"}`,
    `tool events: ${toolEvents.length}`,
    `observed tool steps: ${completedRuns.reduce((sum, run) => sum + (run.observedActionCount ?? 0), 0)}`,
    usage.lastPreview ? `last preview: ${usage.lastPreview}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatOperatorInsights(
  input: ChatTurnRequest,
  sessionKey: string,
  context: AgentExecutionContext,
): string {
  const usage = context.services.sessions.usage(sessionKey);
  const profile = context.services.userProfiles.get(input.userId);
  const sharedMemory = context.services.memory.summary("memory");
  const userMemory = context.services.memory.summary("user");
  const generatedSkills =
    context.services.skillSynthesis.listGeneratedSkills(5);
  const events = context.services.trajectories
    .recentEvents(300)
    .filter((event) => event.sessionId === sessionKey);
  const failures = events.filter((event) => /failed|error/iu.test(event.event));
  const compressionEvents = events.filter(
    (event) => event.event === "session.compressed",
  );
  const recentTools = events
    .filter((event) => event.category === "tool")
    .slice(-5)
    .map((event) => event.text.slice(0, 140));

  return [
    "OPERATOR INSIGHTS",
    `session: ${sessionKey}`,
    `conversation: ${usage.messageCount} messages, ~${usage.estimatedTokens.toLocaleString()} tokens`,
    `memory: shared=${sharedMemory.entries} user=${userMemory.entries} profileFacts=${profile.facts.length} preferences=${profile.preferences.length} aliases=${profile.aliases?.length ?? 0}`,
    `profile: ${profile.displayName ?? "unknown"}`,
    `trajectory: events=${events.length} failures=${failures.length} compressions=${compressionEvents.length}`,
    `generated skills: ${generatedSkills.length ? generatedSkills.map((skill) => skill.slug).join(", ") : "none"}`,
    recentTools.length ? "recent tool signals:" : "recent tool signals: none",
    ...recentTools.map((tool) => `- ${tool}`),
    "",
    "Next best controls:",
    "- /usage for timing/context pressure",
    "- /compress [focus] when context pressure climbs",
    "- /skills synthesize latest after a reusable workflow lands",
    "- /model list before switching inference routes",
  ].join("\n");
}

export async function handleSessionCommand(
  input: ChatTurnRequest,
  trimmed: string,
  sessionKey: string,
  context: AgentExecutionContext,
  dependencies: ChatCommandRouterDependencies,
): Promise<string | undefined> {
  const compression = await handleConversationCompression(
    trimmed,
    sessionKey,
    context,
    dependencies,
  );
  if (compression) {
    return compression;
  }

  if (trimmed === "/insights") {
    return formatOperatorInsights(input, sessionKey, context);
  }

  if (trimmed === "/undo") {
    const result = context.services.sessions.deleteLatestExchange(sessionKey, {
      skipSlashCommands: true,
    });
    if (!result.userMessage) {
      return "No conversational exchange is available to undo.";
    }
    return [
      `Undid the latest exchange (${result.deletedMessages} message${result.deletedMessages === 1 ? "" : "s"} removed).`,
      `Prompt: ${result.userMessage.text.slice(0, 180)}`,
    ].join("\n");
  }

  if (trimmed.startsWith("/search ")) {
    const query = trimmed.replace("/search ", "").trim();
    const matches = context.services.sessions.search(
      query,
      context.config.sessionSearchLimit,
    );
    return matches.length
      ? matches
          .map(
            (match) =>
              `- [${match.createdAt}] (${match.role}) session=${match.sessionId}: ${match.text}`,
          )
          .join("\n")
      : "No prior session matches found.";
  }

  if (trimmed === "/sessions" || trimmed === "/sessions list") {
    const sessions = context.services.sessions.listSessions(10);
    return sessions.length
      ? sessions
          .map(
            (session) =>
              `- ${session.sessionId} messages=${session.messageCount} started=${session.startedAt ?? "n/a"} ended=${session.endedAt ?? "n/a"} participants=${session.participants.join(",") || "none"}`,
          )
          .join("\n")
      : "No sessions recorded.";
  }

  if (trimmed === "/resume") {
    const titled = context.services.sessions.listTitled(10);
    return titled.length
      ? titled
          .map(
            (session) =>
              `- ${session.title ?? "(untitled)"}\n  session=${session.sessionId} messages=${session.messageCount} ended=${session.endedAt ?? "n/a"}`,
          )
          .join("\n")
      : "No titled sessions are available yet. Use /title <name> to name the current session.";
  }

  if (trimmed.startsWith("/resume ")) {
    const query = trimmed.replace("/resume ", "").trim();
    if (!query) {
      return "Usage: /resume <session title>";
    }
    const target = context.services.sessions.resolveByTitle(query);
    if (!target) {
      return `Session not found for title: ${query}`;
    }
    const currentRoute = context.services.gatewaySessions.get(sessionKey);
    if (currentRoute) {
      context.services.gatewaySessions.setActiveAgentSession(
        sessionKey,
        target.sessionId,
      );
      return `Resumed session ${target.title ?? target.sessionId}. New messages on this route will continue in ${target.sessionId}.`;
    }
    return JSON.stringify(target, null, 2);
  }

  if (trimmed.startsWith("/title ")) {
    const title = trimmed.replace("/title ", "").trim();
    if (!title) {
      return "Usage: /title <name>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionKey, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session title ")) {
    const payload = trimmed.replace("/session title ", "").trim();
    const [sessionId, title] = payload.split("::").map((part) => part.trim());
    if (!sessionId || !title) {
      return "Usage: /session title <session-id> :: <title>";
    }
    return JSON.stringify(
      context.services.sessions.rename(sessionId, title),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session continuity ")) {
    const sessionId = trimmed.replace("/session continuity ", "").trim();
    if (!sessionId) {
      return "Usage: /session continuity <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.continuity(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/session summary") {
    return JSON.stringify(
      context.services.sessions.summarize(sessionKey),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/session summary ")) {
    const sessionId = trimmed.replace("/session summary ", "").trim();
    if (!sessionId) {
      return "Usage: /session summary <session-id>";
    }
    return JSON.stringify(
      context.services.sessions.summarize(sessionId),
      null,
      2,
    );
  }

  if (trimmed === "/usage") {
    return formatOperatorUsage(sessionKey, context);
  }

  if (trimmed.startsWith("/usage ")) {
    const target = trimmed.replace("/usage ", "").trim();
    if (!target) {
      return "Usage: /usage <session-id|session-title>";
    }
    const resolved =
      context.services.sessions.resolveByTitle(target)?.sessionId ?? target;
    return formatOperatorUsage(resolved, context);
  }

  return undefined;
}
