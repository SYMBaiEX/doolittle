import { timingSafeEqual } from "node:crypto";
import { realpathSync, statSync } from "node:fs";
import { readWorkerBotProfile } from "../../runtime/bootstrap/bot-profile";
import type { AppContext } from "../../runtime/bootstrap/index";
import { claimTerminalActionScope } from "../../runtime/terminal-action-scope";
import {
  isDesktopWorkspaceRuntime,
  resolveConversationWorkspace,
  runWithConversationWorkspace,
} from "../../runtime/workspace-scope";
import { json } from "../responses";
import type { RouteHandler } from "../router";

const ORIGIN_HEADER = "x-doolittle-origin-conversation";

/** Private main-process capability; renderer-supplied headers are stripped. */
export function hasDesktopControlCapability(request: Request): boolean {
  const expected = process.env.DOOLITTLE_DESKTOP_CONTROL_TOKEN;
  const supplied = request.headers.get("x-doolittle-desktop-control-token");
  if (!expected || !supplied || readWorkerBotProfile()) return false;
  const approved = Buffer.from(expected);
  const received = Buffer.from(supplied);
  return (
    approved.length === received.length && timingSafeEqual(approved, received)
  );
}

export function withDirectConversationWorkspace(
  handler: RouteHandler<AppContext>,
  matches: (url: URL) => boolean,
): RouteHandler<AppContext> {
  return async (context, request, url) => {
    if (!matches(url) || !isDesktopWorkspaceRuntime()) {
      return handler(context, request, url);
    }
    let origin = request.headers.get(ORIGIN_HEADER);
    let terminalLease: Awaited<ReturnType<typeof claimTerminalActionScope>>;
    if (
      !origin &&
      request.method === "POST" &&
      url.pathname === "/api/terminal/run"
    ) {
      terminalLease = await claimTerminalActionScope(request);
      if (terminalLease) origin = terminalLease.scope.sessionId;
    }
    if (!origin) {
      if (request.method === "GET" && hasDesktopControlCapability(request)) {
        try {
          const workspacePath = realpathSync(context.config.workspaceDir);
          if (!statSync(workspacePath).isDirectory())
            return json({ error: "Operator workspace is unavailable." }, 409);
          return runWithConversationWorkspace(
            {
              sessionId: "operator-inventory",
              botId: String(context.runtime.agentId),
              workspacePath,
            },
            () => Promise.resolve(handler(context, request, url)),
          );
        } catch {
          return json({ error: "Operator workspace is unavailable." }, 409);
        }
      }
      return json(
        {
          error: "Conversation workspace scope is required.",
          code: "session_workspace_unavailable",
        },
        409,
      );
    }
    let scope: Awaited<ReturnType<typeof resolveConversationWorkspace>>;
    try {
      scope = await resolveConversationWorkspace(origin, request.signal);
    } catch {
      return json(
        {
          error: "Conversation workspace scope is unavailable.",
          code: "session_workspace_unavailable",
        },
        409,
      );
    }
    if (terminalLease) {
      const expected = terminalLease.scope;
      if (
        scope.botId !== expected.botId ||
        scope.projectId !== expected.projectId ||
        scope.workspacePath !== expected.workspacePath ||
        terminalLease.signal.aborted
      )
        return json({ error: "Terminal workspace authority changed." }, 409);
      request = new Request(request, {
        signal: AbortSignal.any([request.signal, terminalLease.signal]),
      });
    }
    return runWithConversationWorkspace(scope, () =>
      Promise.resolve(handler(context, request, url)),
    );
  };
}
