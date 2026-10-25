import { buildSystemFactsContext } from "../chat-turn/response-shaping";
import { handleExecutionApprovalCommand } from "../commands/approval-router";
import { handleControlPlaneCommand } from "../commands/control-plane-commands";
import { handleIdentityStatusCommand } from "../commands/identity-status-router";
import { formatPersonalitySummary } from "../commands/runtime-status-formatters";
import { handleRuntimeWorkspaceCommand } from "../commands/runtime-workspace-commands";
import { handleSessionCommand } from "../commands/session-router";
import { handleUserProfileCommand } from "../commands/user-profile-router";
import type { ChatCommandRouteGroup } from "./types";

export const lifecycleAndIdentityRoutes = [
  ({ input, trimmed, context, hooks }) =>
    handleExecutionApprovalCommand(input, trimmed, context, hooks),
  ({ input, trimmed, context }) =>
    handleControlPlaneCommand(input, trimmed, context),
  ({ input, trimmed, sessionKey, context, dependencies, hooks }) =>
    handleSessionCommand(
      input,
      trimmed,
      sessionKey,
      context,
      dependencies,
      hooks,
    ),
  ({ input, trimmed, context }) =>
    handleRuntimeWorkspaceCommand(input, trimmed, context),
  ({ input, trimmed, context }) =>
    handleUserProfileCommand(input, trimmed, context),
  ({ trimmed, context }) =>
    handleIdentityStatusCommand(trimmed, context, {
      formatPersonalitySummary,
      buildSystemFactsContext,
    }),
] as const satisfies ChatCommandRouteGroup;
