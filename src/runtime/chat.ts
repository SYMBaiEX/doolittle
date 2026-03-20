import {
  ChannelType,
  createMessageMemory,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import { randomUUID } from "node:crypto";
import type { AppContext } from "./bootstrap";
import type { ChatTurnRequest, MemoryTarget } from "@/types";

export type AgentExecutionContext = Pick<AppContext, "config" | "services" | "runtime"> & {
  gateway?: AppContext["gateway"];
};

function nowIso(): string {
  return new Date().toISOString();
}

export function syncProviderSettings(
  context: AgentExecutionContext,
  settings: ReturnType<AgentExecutionContext["services"]["settings"]["get"]>,
): void {
  context.runtime.setSetting("runtimeSettings", JSON.stringify(settings));

  const provider = settings.model.provider;
  const model = settings.model.model;
  const baseUrl = settings.model.baseUrl;

  if (provider === "anthropic") {
    context.runtime.setSetting("ANTHROPIC_SMALL_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_LARGE_MODEL", model);
    context.runtime.setSetting("ANTHROPIC_BASE_URL", baseUrl);
    return;
  }

  context.runtime.setSetting("OPENAI_SMALL_MODEL", model);
  context.runtime.setSetting("OPENAI_LARGE_MODEL", model);
  context.runtime.setSetting("OPENAI_BASE_URL", baseUrl);
}

async function buildCommandResponse(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): Promise<string | undefined> {
  const { message } = input;
  const trimmed = message.trim();

  if (trimmed.startsWith("/memory")) {
    const target: MemoryTarget =
      trimmed.includes(" user ") || trimmed.endsWith(" user") ? "user" : "memory";
    if (trimmed === "/memory" || trimmed === "/memory list" || trimmed === `/memory list ${target}`) {
      return context.services.memory.renderSnapshot(target);
    }
  }

  if (trimmed === "/skills" || trimmed === "/skills list") {
    const skills = context.services.skills.list();
    return skills.length
      ? skills.map((skill) => `- ${skill.slug}: ${skill.description}`).join("\n")
      : "No skills found.";
  }

  if (trimmed.startsWith("/skills show ")) {
    const slug = trimmed.replace("/skills show ", "").trim();
    const skill = context.services.skills.get(slug);
    return skill ? skill.content : `Skill not found: ${slug}`;
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

  if (trimmed === "/cron" || trimmed === "/cron list") {
    const jobs = context.services.cron.list();
    return jobs.length
      ? jobs
          .map(
            (job) =>
              `- ${job.id} ${job.name} [${job.status}] schedule="${job.schedule}" next=${job.nextRunAt ?? "n/a"}`,
          )
          .join("\n")
      : "No cron jobs configured.";
  }

  if (trimmed === "/cron runs") {
    const runs = context.services.cron.recentRuns(10);
    return runs.length
      ? runs
          .map(
            (run) =>
              `- ${run.jobName} [${run.createdAt}]${run.outputPath ? ` output=${run.outputPath}` : ""}\n${run.output.slice(0, 240)}`,
          )
          .join("\n\n")
      : "No cron runs recorded.";
  }

  if (trimmed.startsWith("/cron create ")) {
    const payload = trimmed.replace("/cron create ", "");
    const [schedule, prompt] = payload.split("::").map((part) => part.trim());
    if (!schedule || !prompt) {
      return "Usage: /cron create <schedule> :: <prompt>";
    }

    const created = context.services.cron.create({
      name: `job-${Date.now()}`,
      schedule,
      prompt,
      delivery: input.source === "cron" ? "local" : "origin",
    });
    return `Created cron job ${created.id} with next run ${created.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron pause ")) {
    const job = context.services.cron.pause(trimmed.replace("/cron pause ", "").trim());
    return `Paused ${job.id}.`;
  }

  if (trimmed.startsWith("/cron resume ")) {
    const job = context.services.cron.resume(trimmed.replace("/cron resume ", "").trim());
    return `Resumed ${job.id}; next run ${job.nextRunAt ?? "n/a"}.`;
  }

  if (trimmed.startsWith("/cron run ")) {
    const job = context.services.cron.runNow(trimmed.replace("/cron run ", "").trim());
    return `Marked ${job.id} to run immediately.`;
  }

  if (trimmed.startsWith("/cron remove ")) {
    const id = trimmed.replace("/cron remove ", "").trim();
    context.services.cron.remove(id);
    return `Removed ${id}.`;
  }

  if (trimmed === "/personality" || trimmed === "/personality status") {
    const active = context.services.personalities.getActive();
    return `${active.name} (${active.id})\n${active.description}\n${active.systemAddendum}`;
  }

  if (trimmed === "/personality list") {
    return context.services.personalities
      .list()
      .map((profile) => `- ${profile.id}: ${profile.description}`)
      .join("\n");
  }

  if (trimmed.startsWith("/personality set ")) {
    const id = trimmed.replace("/personality set ", "").trim();
    const profile = context.services.personalities.setActive(id);
    return `Active personality set to ${profile.name}.`;
  }

  if (trimmed === "/context" || trimmed === "/context files") {
    return context.services.contextFiles.render();
  }

  if (trimmed === "/workspace" || trimmed === "/workspace tree") {
    return context.services.workspace.summary(40);
  }

  if (trimmed.startsWith("/workspace read ")) {
    const path = trimmed.replace("/workspace read ", "").trim();
    return context.services.workspace.read(path);
  }

  if (trimmed.startsWith("/workspace search ")) {
    const query = trimmed.replace("/workspace search ", "").trim();
    const results = context.services.workspace.search(query, 20);
    return results.length
      ? results
          .map((result) => `${result.path}\n${result.matches.map((line) => `  ${line}`).join("\n")}`)
          .join("\n\n")
      : "No workspace matches found.";
  }

  if (trimmed.startsWith("/workspace write ")) {
    const payload = trimmed.replace("/workspace write ", "");
    const [path, ...contentParts] = payload.split("::");
    const relativePath = path?.trim();
    const content = contentParts.join("::").trim();
    if (!relativePath || !content) {
      return "Usage: /workspace write <path> :: <content>";
    }
    const writtenPath = context.services.workspace.write(relativePath, content);
    return `Wrote ${writtenPath}.`;
  }

  if (trimmed === "/status") {
    const personality = context.services.personalities.getActive();
    const skillsCount = context.services.skills.list().length;
    const cronJobs = context.services.cron.list().length;
    const gatewaySessions = context.services.gatewaySessions.list().length;
    const settings = context.services.settings.get();
    return [
      `Agent: ${context.config.agentName}`,
      `Personality: ${personality.name}`,
      `Provider: ${settings.model.provider}`,
      `Model: ${settings.model.model}`,
      `Skills: ${skillsCount}`,
      `Cron jobs: ${cronJobs}`,
      `Gateway sessions: ${gatewaySessions}`,
    ].join("\n");
  }

  if (trimmed === "/gateway readiness") {
    if (!context.gateway) {
      return "Gateway runtime is not attached to this execution context.";
    }
    const health = await context.gateway.health();
    return health
      .map(
        (entry) =>
          `- ${entry.platform} [${entry.status}] ready=${entry.ready} mode=${entry.mode} inbound=${entry.capabilities.inbound} outbound=${entry.capabilities.outbound} :: ${entry.detail}`,
      )
      .join("\n");
  }

  if (trimmed === "/model" || trimmed === "/model status") {
    return JSON.stringify(context.services.settings.get().model, null, 2);
  }

  if (trimmed === "/execution" || trimmed === "/execution status") {
    const settings = context.services.settings.get().execution;
    const health = await context.services.terminal.health();
    return JSON.stringify(
      {
        active: settings,
        backends: health,
      },
      null,
      2,
    );
  }

  if (trimmed.startsWith("/execution set ")) {
    const payload = trimmed.replace("/execution set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /execution set <field> <value>";
    }
    const path = field.startsWith("execution.") ? field : `execution.${field}`;
    const settings = context.services.settings.set(path, valueRaw);
    return JSON.stringify(settings.execution, null, 2);
  }

  if (trimmed.startsWith("/model set ")) {
    const payload = trimmed.replace("/model set ", "").trim();
    const [field, ...valueParts] = payload.split(" ");
    const valueRaw = valueParts.join(" ").trim();
    if (!field || !valueRaw) {
      return "Usage: /model set <field> <value>";
    }
    const path = field.startsWith("model.") ? field : `model.${field}`;
    const value =
      valueRaw === "true"
        ? true
        : valueRaw === "false"
          ? false
          : Number.isNaN(Number(valueRaw))
            ? valueRaw
            : Number(valueRaw);
    const settings = context.services.settings.set(path, value);
    syncProviderSettings(context, settings);
    return JSON.stringify(settings.model, null, 2);
  }

  if (trimmed === "/config" || trimmed === "/config show") {
    return JSON.stringify(context.services.settings.get(), null, 2);
  }

  if (trimmed === "/doctor") {
    const checks = await context.services.diagnostics.run({
      skillsCount: context.services.skills.list().length,
      contextFilesCount: context.services.contextFiles.list().length,
      recentCronRuns: context.services.cron.recentRuns(5).length,
      recentTerminalCommands: context.services.terminal.recent(5).length,
      repositoryAvailable: context.services.repository.isRepository(),
    });
    return checks
      .map((check) => `[${check.status.toUpperCase()}] ${check.summary}: ${check.detail}`)
      .join("\n");
  }

  if (trimmed === "/setup" || trimmed === "/setup checklist") {
    const checklist = await context.services.diagnostics.setupChecklist();
    return checklist.map((item, index) => `${index + 1}. ${item}`).join("\n");
  }

  if (trimmed === "/terminal" || trimmed === "/terminal recent") {
    const commands = context.services.terminal.recent(10);
    return commands.length
      ? commands
          .map(
            (entry) =>
              `- [${entry.exitCode}] ${entry.command}\n  stdout=${entry.stdout.slice(0, 160) || "(empty)"}\n  stderr=${entry.stderr.slice(0, 160) || "(empty)"}`,
          )
          .join("\n")
      : "No terminal commands recorded.";
  }

  if (trimmed.startsWith("/terminal run ")) {
    const command = trimmed.replace("/terminal run ", "").trim();
    if (!command) {
      return "Usage: /terminal run <command>";
    }
    const result = await context.services.terminal.run(command);
    return [
      `Command: ${result.command}`,
      `Exit: ${result.exitCode}`,
      `STDOUT:\n${result.stdout || "(empty)"}`,
      `STDERR:\n${result.stderr || "(empty)"}`,
    ].join("\n");
  }

  if (trimmed === "/repo" || trimmed === "/repo status") {
    return context.services.repository.status();
  }

  if (trimmed === "/repo diff") {
    return context.services.repository.diffStat();
  }

  if (trimmed === "/repo log") {
    return context.services.repository.recentCommits();
  }

  if (trimmed === "/tools" || trimmed === "/tools list") {
    return context.services.tools
      .list()
      .map(
        (tool) =>
          `- ${tool.id} [${tool.enabled ? "enabled" : "disabled"}] ${tool.category}: ${tool.description}`,
      )
      .join("\n");
  }

  if (trimmed === "/mcp" || trimmed === "/mcp status") {
    return JSON.stringify(context.services.mcp.status(), null, 2);
  }

  if (trimmed === "/mcp tools") {
    return JSON.stringify(await context.services.mcp.discoverTools(), null, 2);
  }

  if (trimmed.startsWith("/mcp invoke ")) {
    const input = trimmed.replace("/mcp invoke ", "").trim();
    return JSON.stringify(await context.services.mcp.invoke(input), null, 2);
  }

  if (trimmed.startsWith("/mcp call ")) {
    const payload = trimmed.replace("/mcp call ", "");
    const [toolName, inputRaw] = payload.split("::").map((part) => part.trim());
    if (!toolName) {
      return "Usage: /mcp call <toolName> :: <json-input>";
    }
    const parsedInput = inputRaw ? JSON.parse(inputRaw) as Record<string, unknown> : {};
    return JSON.stringify(await context.services.mcp.invokeTool(toolName, parsedInput), null, 2);
  }

  if (trimmed.startsWith("/web fetch ")) {
    const url = trimmed.replace("/web fetch ", "").trim();
    return JSON.stringify(await context.services.web.fetchText(url), null, 2);
  }

  if (trimmed.startsWith("/web snapshot ")) {
    const url = trimmed.replace("/web snapshot ", "").trim();
    return await context.services.web.snapshot(url);
  }

  if (trimmed.startsWith("/media inspect ")) {
    const path = trimmed.replace("/media inspect ", "").trim();
    return JSON.stringify(context.services.media.inspect(path), null, 2);
  }

  if (trimmed === "/delegate" || trimmed === "/delegate list") {
    const tasks = context.services.delegation.list().slice(0, 20);
    return tasks.length
      ? tasks
          .map(
            (task) =>
              `- ${task.id} ${task.title} [${task.status}] mode=${task.executionMode}\n  ${task.objective}`,
          )
          .join("\n")
      : "No delegation tasks recorded.";
  }

  if (trimmed.startsWith("/delegate create ")) {
    const payload = trimmed.replace("/delegate create ", "");
    const [title, objective] = payload.split("::").map((part) => part.trim());
    if (!title || !objective) {
      return "Usage: /delegate create <title> :: <objective>";
    }
    const task = context.services.delegation.create({
      title,
      objective,
      executionMode: "delegated",
    });
    return JSON.stringify(task, null, 2);
  }

  if (trimmed.startsWith("/delegate note ")) {
    const payload = trimmed.replace("/delegate note ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id || !note) {
      return "Usage: /delegate note <id> :: <note>";
    }
    return JSON.stringify(context.services.delegation.addNote(id, note), null, 2);
  }

  if (trimmed.startsWith("/delegate run ")) {
    const id = trimmed.replace("/delegate run ", "").trim();
    return JSON.stringify(context.services.delegation.markRunning(id), null, 2);
  }

  if (trimmed.startsWith("/delegate execute ")) {
    const id = trimmed.replace("/delegate execute ", "").trim();
    const task = context.services.delegation.markRunning(id);
    const result = await handleAgentTurn(
      {
        message: task.objective,
        userId: `delegate:${id}`,
        roomId: `delegate:${id}`,
        source: "delegate",
      },
      context,
    );
    return JSON.stringify(context.services.delegation.complete(id, result), null, 2);
  }

  if (trimmed === "/delegate execute-queued") {
    const completed = await context.services.delegation.executeQueued(
      async (task) =>
        handleAgentTurn(
          {
            message: task.objective,
            userId: `delegate:${task.id}`,
            roomId: `delegate:${task.id}`,
            source: "delegate",
          },
          context,
        ),
      {
        concurrency: 2,
        onComplete: async (task) => {
          context.services.skillSynthesis.synthesizeFromTask(task);
        },
      },
    );
    return completed.length
      ? completed.map((task) => `- ${task.title} [${task.status}]`).join("\n")
      : "No pending delegation tasks to execute.";
  }

  if (trimmed.startsWith("/delegate complete ")) {
    const payload = trimmed.replace("/delegate complete ", "");
    const [id, note] = payload.split("::").map((part) => part.trim());
    if (!id) {
      return "Usage: /delegate complete <id> :: <optional note>";
    }
    return JSON.stringify(context.services.delegation.complete(id, note), null, 2);
  }

  if (trimmed.startsWith("/skills synthesize ")) {
    const id = trimmed.replace("/skills synthesize ", "").trim();
    const task = context.services.delegation.list().find((entry) => entry.id === id);
    if (!task) {
      return `Delegation task not found: ${id}`;
    }
    return context.services.skillSynthesis.synthesizeFromTask(task);
  }

  if (trimmed === "/trajectories export") {
    return context.services.trajectories.exportRecent(200);
  }

  if (trimmed === "/trajectories bundle") {
    return JSON.stringify(context.services.trajectories.exportBundle(200), null, 2);
  }

  return undefined;
}

export async function handleAgentTurn(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
): Promise<string> {
  const responseFromCommandLayer = await buildCommandResponse(input, context);
  const roomKey = input.roomId ?? `room:${input.userId}`;
  const roomId = stringToUuid(roomKey);
  const worldId = stringToUuid("eliza-agent-world");
  const entityId = stringToUuid(input.userId);
  const sessionId = roomKey;

  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId,
    roomId,
    entityId,
    role: "user",
    text: input.message,
    createdAt: nowIso(),
  });

  if (responseFromCommandLayer) {
    context.services.sessions.storeMessage({
      id: randomUUID(),
      sessionId,
      roomId,
      entityId,
      role: "assistant",
      text: responseFromCommandLayer,
      createdAt: nowIso(),
    });
    return responseFromCommandLayer;
  }

  await context.runtime.ensureConnection({
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    worldId: worldId as UUID,
    userName: input.userId,
    source: input.source ?? "cli",
    channelId: roomKey,
    serverId: "eliza-agent",
    type: ChannelType.DM,
  } as Parameters<typeof context.runtime.ensureConnection>[0]);

  const memory = createMessageMemory({
    id: randomUUID() as UUID,
    entityId: entityId as UUID,
    roomId: roomId as UUID,
    content: {
      text: input.message,
      source: input.source ?? "cli",
      channelType: ChannelType.DM,
    },
  });

  let response = "";

  await context.runtime.messageService?.handleMessage(
    context.runtime,
    memory,
    async (content) => {
      if (content?.text) {
        response += content.text;
      }
      return [];
    },
  );

  const finalResponse =
    response.trim() || "The runtime completed without producing a response.";

  context.services.sessions.storeMessage({
    id: randomUUID(),
    sessionId,
    roomId,
    entityId,
    role: "assistant",
    text: finalResponse,
    createdAt: nowIso(),
  });

  return finalResponse;
}
