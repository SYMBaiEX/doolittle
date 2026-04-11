import { normalizeSlashCommandSyntax } from "@/runtime/command-catalog";
import { handleAccountsCommand } from "@/runtime/commands/accounts";
import { handleExecutionApprovalCommand } from "@/runtime/commands/approval-router";
import { handleBrowserMediaCommand } from "@/runtime/commands/browser-media-commands";
import { handleCodegenCommand } from "@/runtime/commands/codegen-commands";
import { handleControlPlaneCommand } from "@/runtime/commands/control-plane-commands";
import { handleCronCommand } from "@/runtime/commands/cron-router";
import { handleDelegationCommand } from "@/runtime/commands/delegation-commands";
import { handleFormsCommand } from "@/runtime/commands/forms";
import { handleGatewayRuntimeCommand } from "@/runtime/commands/gateway-runtime";
import { handleIdentityStatusCommand } from "@/runtime/commands/identity-status-router";
import { handleOperatorCommand } from "@/runtime/commands/operator-commands";
import { handlePlansCommand } from "@/runtime/commands/plans";
import { handleRuntimeIntrospectionCommand } from "@/runtime/commands/runtime-introspection-commands";
import { handleRuntimeWorkspaceCommand } from "@/runtime/commands/runtime-workspace-commands";
import { handleSessionCommand } from "@/runtime/commands/session-router";
import { handleSettingsThemeCommand } from "@/runtime/commands/settings-theme-commands";
import { handleSkillCommand } from "@/runtime/commands/skills";
import { handleToolingCommand } from "@/runtime/commands/tooling-commands";
import { handleTrajectoryCommand } from "@/runtime/commands/trajectory";
import { handleUserProfileCommand } from "@/runtime/commands/user-profile-router";
import type { ChatTurnRequest } from "@/types/runtime";
import type { AgentExecutionContext, AgentTurnHooks } from "./chat";
import { buildSystemFactsContext } from "./chat-turn/response-shaping";
import { formatPersonalitySummary } from "./commands/runtime-status-formatters";

export async function buildCommandResponse(
  input: ChatTurnRequest,
  context: AgentExecutionContext,
  hooks: AgentTurnHooks | undefined,
  dependencies: {
    runAnalysis: (prompt: string, label: string) => Promise<string>;
    runDelegationTaskInWorker: (
      taskId: string,
      options?: { assumeRunning?: boolean },
    ) => Promise<
      ReturnType<AgentExecutionContext["services"]["delegation"]["get"]>
    >;
  },
): Promise<string | undefined> {
  const { message } = input;
  const trimmed = normalizeSlashCommandSyntax(message.trim());
  const sessionKey = input.roomId ?? `room:${input.userId}`;

  const approvalResponse = await handleExecutionApprovalCommand(
    input,
    trimmed,
    context,
    hooks,
  );
  if (approvalResponse) {
    return approvalResponse;
  }

  const controlPlaneResponse = await handleControlPlaneCommand(
    input,
    trimmed,
    context,
  );
  if (controlPlaneResponse) {
    return controlPlaneResponse;
  }

  const sessionResponse = await handleSessionCommand(
    input,
    trimmed,
    sessionKey,
    context,
  );
  if (sessionResponse) {
    return sessionResponse;
  }

  const runtimeWorkspaceResponse = await handleRuntimeWorkspaceCommand(
    input,
    trimmed,
    context,
  );
  if (runtimeWorkspaceResponse) {
    return runtimeWorkspaceResponse;
  }

  const userProfileResponse = await handleUserProfileCommand(
    input,
    trimmed,
    context,
  );
  if (userProfileResponse) {
    return userProfileResponse;
  }

  const identityStatusResponse = await handleIdentityStatusCommand(
    trimmed,
    context,
    {
      formatPersonalitySummary,
      buildSystemFactsContext,
    },
  );
  if (identityStatusResponse) {
    return identityStatusResponse;
  }

  const cronResponse = await handleCronCommand(input, trimmed, context);
  if (cronResponse) {
    return cronResponse;
  }

  const skillResponse = await handleSkillCommand(trimmed, context);
  if (skillResponse) {
    return skillResponse;
  }

  const toolingResponse = await handleToolingCommand(trimmed, context);
  if (toolingResponse) {
    return toolingResponse;
  }

  const browserMediaResponse = await handleBrowserMediaCommand(
    trimmed,
    context,
    {
      runAnalysis: dependencies.runAnalysis,
    },
  );
  if (browserMediaResponse) {
    return browserMediaResponse;
  }

  const codegenResponse = await handleCodegenCommand(trimmed, context);
  if (codegenResponse) {
    return codegenResponse;
  }

  const trajectoryResponse = await handleTrajectoryCommand(trimmed, context);
  if (trajectoryResponse) {
    return trajectoryResponse;
  }

  const delegationResponse = await handleDelegationCommand(trimmed, context, {
    runDelegationTaskInWorker: dependencies.runDelegationTaskInWorker,
  });
  if (delegationResponse) {
    return delegationResponse;
  }

  const operatorResponse = await handleOperatorCommand(
    input,
    trimmed,
    context,
    hooks,
  );
  if (operatorResponse) {
    return operatorResponse;
  }

  const gatewayRuntimeResponse = await handleGatewayRuntimeCommand(
    input,
    trimmed,
    sessionKey,
    context,
  );
  if (gatewayRuntimeResponse) {
    return gatewayRuntimeResponse;
  }

  const accountsResponse = await handleAccountsCommand(
    input,
    trimmed,
    context,
    hooks,
  );
  if (accountsResponse) {
    return accountsResponse;
  }

  const runtimeIntrospectionResponse = await handleRuntimeIntrospectionCommand(
    trimmed,
    context,
  );
  if (runtimeIntrospectionResponse) {
    return runtimeIntrospectionResponse;
  }

  const formsResponse = await handleFormsCommand(trimmed, context);
  if (formsResponse) {
    return formsResponse;
  }

  const plansResponse = await handlePlansCommand(trimmed, context);
  if (plansResponse) {
    return plansResponse;
  }

  const settingsThemeResponse = await handleSettingsThemeCommand(
    trimmed,
    context,
  );
  if (settingsThemeResponse) {
    return settingsThemeResponse;
  }

  return undefined;
}
