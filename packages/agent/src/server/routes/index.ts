import type { AppContext } from "../../runtime/bootstrap/index";
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
import { handleKnowledgeBrokerRoutes } from "./knowledge-broker";
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
import { withDirectConversationWorkspace } from "./workspace-scope";

const scopedAcpRoutes = withDirectConversationWorkspace(
  handleAcpRoutes,
  (url) => url.pathname.startsWith("/acp/"),
);
const scopedWorkspaceRoutes = withDirectConversationWorkspace(
  handleWorkspaceRoutes,
  (url) => url.pathname.startsWith("/workspace/"),
);
const scopedOperationsRoutes = withDirectConversationWorkspace(
  handleOperationsRoutes,
  (url) =>
    url.pathname.startsWith("/terminal/") ||
    url.pathname.startsWith("/api/terminal/") ||
    url.pathname === "/workspace/write",
);
const scopedRepositoryRoutes = withDirectConversationWorkspace(
  handleRepositoryRoutes,
  (url) => url.pathname.startsWith("/repo/"),
);
const scopedRuntimeInventory = withDirectConversationWorkspace(
  handleRuntimeRoutes,
  (url) =>
    url.pathname === "/commands/catalog" ||
    url.pathname === "/runtime/workspace" ||
    [
      "/runtime/ecosystem",
      "/runtime/autonomous",
      "/insights",
      "/ecosystem",
    ].includes(url.pathname),
);
const scopedRuntimeRoutes: RouteHandler<AppContext> = (
  context,
  request,
  url,
) =>
  // Operator folder navigation has a separate private host capability. It
  // changes only the bootstrap inventory root, never an existing chat grant.
  request.method === "POST" && url.pathname === "/runtime/workspace"
    ? handleRuntimeRoutes(context, request, url)
    : scopedRuntimeInventory(context, request, url);
const scopedBrowserRoutes = withDirectConversationWorkspace(
  handleBrowserRoutes,
  (url) => url.pathname === "/browser/render-targets",
);
const scopedActivityRoutes = withDirectConversationWorkspace(
  handleActivityRoutes,
  (url) => url.pathname === "/activity" || url.pathname === "/activity/export",
);
const scopedExecutionRoutes = withDirectConversationWorkspace(
  handleSettingsExecutionRoutes,
  (url) =>
    url.pathname === "/execution/status" ||
    url.pathname === "/execution/backends",
);
const scopedReviewRecordRoutes = withDirectConversationWorkspace(
  handleReviewRecordRoutes,
  (url) => url.pathname.startsWith("/review-record"),
);
const scopedMigrationRoutes = withDirectConversationWorkspace(
  handleMigrationRoutes,
  (url) => url.pathname.startsWith("/migrate/"),
);
const scopedSkillRoutes = withDirectConversationWorkspace(
  handleSkillRoutes,
  (url) => url.pathname === "/skills" || url.pathname.startsWith("/skills/"),
);
const scopedContextDocumentRoutes = withDirectConversationWorkspace(
  handleContextDocumentRoutes,
  (url) =>
    url.pathname === "/context/files" ||
    url.pathname === "/documents/pdf/extract",
);
const scopedDelegationCommandRoutes = withDirectConversationWorkspace(
  handleDelegationCommandRoutes,
  (url) => url.pathname.startsWith("/delegation/"),
);
const scopedDelegationMutationRoutes = withDirectConversationWorkspace(
  handleDelegationMutationRoutes,
  (url) => url.pathname.startsWith("/delegation/"),
);
const scopedDiagnosticInventory = withDirectConversationWorkspace(
  handleDiagnosticsRoutes,
  (url) =>
    [
      "/setup/summary",
      "/setup/checklist",
      "/update/preview",
      "/doctor",
    ].includes(url.pathname),
);

export const apiRouteHandlers = [
  handleKnowledgeBrokerRoutes,
  scopedRuntimeRoutes,
  scopedActivityRoutes,
  scopedDiagnosticInventory,
  scopedMigrationRoutes,
  handleMemoryRoutes,
  handleSessionRoutes,
  handleSessionTransferRoutes,
  handleProjectRoutes,
  handleGatewaySessionRoutes,
  handleTransportRoutes,
  handleGatewayRuntimeRoutes,
  scopedSkillRoutes,
  handleToolRoutes,
  handleMediaRoutes,
  handleManagedMediaRoutes,
  handleMcpRoutes,
  scopedAcpRoutes,
  scopedWorkspaceRoutes,
  scopedBrowserRoutes,
  handleFormsPlanningRoutes,
  handleSandboxRoutes,
  handleDelegationReadRoutes,
  handleCodegenRoutes,
  handleSecretsRoutes,
  scopedOperationsRoutes,
  scopedDelegationCommandRoutes,
  scopedDelegationMutationRoutes,
  handleDelegationTaskFallbackRoutes,
  scopedRepositoryRoutes,
  scopedReviewRecordRoutes,
  handleIdentityRoutes,
  scopedExecutionRoutes,
  scopedContextDocumentRoutes,
  handleCronRoutes,
  handleSkillSynthesisRoutes,
  handleTrajectoryRoutes,
  handleWebhookRoutes,
  handleConversationRoutes,
] satisfies ReadonlyArray<RouteHandler<AppContext>>;
