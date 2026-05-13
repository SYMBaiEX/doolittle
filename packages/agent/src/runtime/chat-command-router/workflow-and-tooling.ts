import { handleBrowserMediaCommand } from "@/runtime/commands/browser-media-commands";
import { handleCodegenCommand } from "@/runtime/commands/codegen";
import { handleCronCommand } from "@/runtime/commands/cron-router";
import { handleDelegationCommand } from "@/runtime/commands/delegation-commands";
import { handleSkillCommand } from "@/runtime/commands/skills";
import { handleToolingCommand } from "@/runtime/commands/tooling-commands";
import { handleTrajectoryCommand } from "@/runtime/commands/trajectory";
import type { ChatCommandRouteGroup } from "./types";

export const workflowAndToolingRoutes = [
  ({ input, trimmed, context }) => handleCronCommand(input, trimmed, context),
  ({ trimmed, sessionKey, context }) =>
    handleSkillCommand(trimmed, context, { sessionId: sessionKey }),
  ({ trimmed, context }) => handleToolingCommand(trimmed, context),
  ({ trimmed, context, dependencies }) =>
    handleBrowserMediaCommand(trimmed, context, {
      runAnalysis: dependencies.runAnalysis,
    }),
  ({ trimmed, context }) => handleCodegenCommand(trimmed, context),
  ({ trimmed, context }) => handleTrajectoryCommand(trimmed, context),
  ({ trimmed, context, dependencies }) =>
    handleDelegationCommand(trimmed, context, {
      runDelegationTaskInWorker: dependencies.runDelegationTaskInWorker,
    }),
] as const satisfies ChatCommandRouteGroup;
