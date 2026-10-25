import { handleBrowserMediaCommand } from "../commands/browser-media-commands/index";
import { handleCodegenCommand } from "../commands/codegen/index";
import { handleCronCommand } from "../commands/cron-router/index";
import { handleDelegationCommand } from "../commands/delegation-commands";
import { handleSkillCommand } from "../commands/skills/index";
import { handleToolingCommand } from "../commands/tooling-commands";
import { handleTrajectoryCommand } from "../commands/trajectory/index";
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
      executeDelegationTask: dependencies.executeDelegationTask,
    }),
] as const satisfies ChatCommandRouteGroup;
