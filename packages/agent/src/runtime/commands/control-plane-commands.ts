import { renderCommandCatalog } from "@/runtime/command-catalog";
import { displayCommand } from "@/runtime/commands/command-execution";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext } from "../chat";

export async function handleControlPlaneCommand(
  _input: ChatTurnRequest,
  trimmed: string,
  context: AgentExecutionContext,
): Promise<string | undefined> {
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
