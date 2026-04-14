import { handleExecutionApprovalCommand } from "@/runtime/commands/approval-router";
import { handleControlPlaneCommand } from "@/runtime/commands/control-plane-commands";
import { handleIdentityStatusCommand } from "@/runtime/commands/identity-status-router";
import { handleRuntimeWorkspaceCommand } from "@/runtime/commands/runtime-workspace-commands";
import { handleSessionCommand } from "@/runtime/commands/session-router";
import { handleUserProfileCommand } from "@/runtime/commands/user-profile-router";
import { buildSystemFactsContext } from "../chat-turn/response-shaping";
import { formatPersonalitySummary } from "../commands/runtime-status-formatters";
import type { ChatCommandRouteGroup } from "./types";

export const lifecycleAndIdentityRoutes = [
  ({ input, trimmed, context, hooks }) =>
    handleExecutionApprovalCommand(input, trimmed, context, hooks),
  ({ input, trimmed, context }) =>
    handleControlPlaneCommand(input, trimmed, context),
  ({ input, trimmed, sessionKey, context }) =>
    handleSessionCommand(input, trimmed, sessionKey, context),
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
