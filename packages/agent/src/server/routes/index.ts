import type { AppContext } from "@/runtime/bootstrap";
import type { RouteHandler } from "../router";
import { handleAcpRoutes } from "./acp";
import { handleActivityRoutes } from "./activity";
import { handleBrowserRoutes } from "./browser";
import { handleCodegenRoutes } from "./codegen";
import { handleContextDocumentRoutes } from "./context-documents";
import { handleConversationRoutes } from "./conversation";
import { handleCronRoutes } from "./cron";
import { handleDelegationCommandRoutes } from "./delegation-commands";
import { handleDelegationMutationRoutes } from "./delegation-mutations";
import { handleDelegationReadRoutes } from "./delegation-read";
import { handleDelegationTaskFallbackRoutes } from "./delegation-tasks";
import { handleDiagnosticsRoutes } from "./diagnostics";
import { handleFormsPlanningRoutes } from "./forms-planning";
import { handleGatewayRuntimeRoutes } from "./gateway-runtime";
import { handleGatewaySessionRoutes } from "./gateway-sessions";
import { handleIdentityRoutes } from "./identity";
import { handleMcpRoutes } from "./mcp";
import { handleMediaRoutes } from "./media";
import { handleManagedMediaRoutes } from "./media-managed";
import { handleMemoryRoutes } from "./memory";
import { handleMigrationRoutes } from "./migrations";
import { handleOperationsRoutes } from "./operations";
import { handleProjectRoutes } from "./projects";
import { handleRepositoryRoutes } from "./repository";
import { handleReviewRecordRoutes } from "./review-record";
import { handleRuntimeRoutes } from "./runtime";
import { handleSandboxRoutes } from "./sandbox";
import { handleSecretsRoutes } from "./secrets";
import { handleSessionTransferRoutes } from "./session-transfer";
import { handleSessionRoutes } from "./sessions";
import { handleSettingsExecutionRoutes } from "./settings-execution";
import { handleSkillSynthesisRoutes } from "./skill-synthesis";
import { handleSkillRoutes } from "./skills";
import { handleToolRoutes } from "./tools";
import { handleTrajectoryRoutes } from "./trajectories";
import { handleTransportRoutes } from "./transport";
import { handleWebhookRoutes } from "./webhooks";
import { handleWorkspaceRoutes } from "./workspace";

export const apiRouteHandlers = [
  handleRuntimeRoutes,
  handleActivityRoutes,
  handleDiagnosticsRoutes,
  handleMigrationRoutes,
  handleMemoryRoutes,
  handleSessionRoutes,
  handleSessionTransferRoutes,
  handleProjectRoutes,
  handleGatewaySessionRoutes,
  handleTransportRoutes,
  handleGatewayRuntimeRoutes,
  handleSkillRoutes,
  handleToolRoutes,
  handleMediaRoutes,
  handleManagedMediaRoutes,
  handleMcpRoutes,
  handleAcpRoutes,
  handleWorkspaceRoutes,
  handleBrowserRoutes,
  handleFormsPlanningRoutes,
  handleSandboxRoutes,
  handleDelegationReadRoutes,
  handleCodegenRoutes,
  handleSecretsRoutes,
  handleOperationsRoutes,
  handleDelegationCommandRoutes,
  handleDelegationMutationRoutes,
  handleDelegationTaskFallbackRoutes,
  handleRepositoryRoutes,
  handleReviewRecordRoutes,
  handleIdentityRoutes,
  handleSettingsExecutionRoutes,
  handleContextDocumentRoutes,
  handleCronRoutes,
  handleSkillSynthesisRoutes,
  handleTrajectoryRoutes,
  handleWebhookRoutes,
  handleConversationRoutes,
] satisfies ReadonlyArray<RouteHandler<AppContext>>;
