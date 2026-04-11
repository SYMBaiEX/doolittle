import { getTransportRequirementRecords } from "@/gateway/transport";
import type { EnvConfig, GatewayConfig } from "@/types";

export function buildDiagnosticsSetupChecklist(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
): string[] {
  const steps = [
    "Copy .env.example to .env and fill in at least one provider credential or linked account setting.",
    "Choose a primary provider: Codex, Claude Code, OpenAI, or Anthropic.",
    "Run bun install so the vendored native Eliza workspace packages resolve before booting the runtime.",
    "Add workspace context files like AGENTS.md or MISSION.md if you want persistent operator guidance.",
    "Enable gateway platforms in gateway.json only after their credentials are configured.",
    "Run /doctor after configuration changes.",
  ];

  for (const requirement of getTransportRequirementRecords(
    config,
    gatewayConfig,
  )) {
    if (requirement.checklist) {
      steps.push(requirement.checklist);
    }
  }
  if (!config.falApiKey) {
    steps.push(
      "Set FAL_API_KEY before relying on the official TTS plugin for voice synthesis.",
    );
  }
  if (config.browserProvider === "lightpanda") {
    steps.push(
      "Install Lightpanda or set DOOLITTLE_BROWSER_PROVIDER=basic if you want browser tasks to fall back to plain HTTP fetch mode.",
    );
  }
  steps.push(
    "Review DOOLITTLE_REMOTE_SYNC_MODE, DOOLITTLE_REMOTE_SYNC_INCLUDE, DOOLITTLE_REMOTE_SYNC_EXCLUDE, DOOLITTLE_REMOTE_ARTIFACT_PATHS, and DOOLITTLE_REMOTE_ARTIFACT_POLICY so Daytona and Modal snapshots stay metadata-only and operator-visible.",
  );
  if (!config.remoteSyncInclude.length) {
    steps.push(
      "Set DOOLITTLE_REMOTE_SYNC_INCLUDE and DOOLITTLE_REMOTE_SYNC_EXCLUDE to describe which paths should be mirrored or snapshotted for remote workspaces.",
    );
  }
  if (!config.remoteArtifactPaths.length) {
    steps.push(
      "Set DOOLITTLE_REMOTE_ARTIFACT_PATHS if you want operator-visible artifact metadata recorded for Daytona and Modal runs.",
    );
  }
  if (!config.remoteWorkspaceLabel) {
    steps.push(
      "Set DOOLITTLE_REMOTE_WORKSPACE_LABEL so remote lifecycle snapshots have a stable operator-facing label.",
    );
  }
  if (!config.mcpServerCommand) {
    steps.push(
      "Set MCP_SERVER_COMMAND if you want MCP-backed tool discovery and invocation.",
    );
  }
  if (!config.acpServerCommand) {
    steps.push(
      "Set ACP_SERVER_COMMAND if you want ACP-backed editor and protocol integrations.",
    );
  }
  if (config.executionBackend !== "local") {
    steps.push(
      `Validate ${config.executionBackend} runtime access and run /execution status before relying on remote or containerized execution.`,
    );
  }
  if (config.executionBackend === "singularity" && !config.singularityImage) {
    steps.push(
      "Set DOOLITTLE_SINGULARITY_IMAGE before relying on the Singularity execution backend.",
    );
  }
  if (config.executionBackend === "daytona" && !config.daytonaTarget) {
    steps.push(
      "Set DOOLITTLE_DAYTONA_TARGET before relying on the Daytona execution backend.",
    );
  }
  if (config.executionBackend === "daytona" && !config.daytonaWorkspacePath) {
    steps.push(
      "Set DOOLITTLE_DAYTONA_WORKSPACE_PATH before relying on the Daytona execution backend.",
    );
  }
  if (!config.daytonaShell) {
    steps.push(
      "Set DOOLITTLE_DAYTONA_SHELL to choose the shell used inside Daytona sandboxes.",
    );
  }
  if (config.executionBackend === "daytona" && !config.daytonaSnapshot) {
    steps.push(
      "Optionally set DOOLITTLE_DAYTONA_SNAPSHOT if you want Daytona execution to anchor to a named sandbox snapshot.",
    );
  }
  if (!config.daytonaInspectCommand) {
    steps.push(
      "Optionally set DOOLITTLE_DAYTONA_INSPECT_COMMAND if you want to override the synthesized Daytona sandbox inspect command.",
    );
  }
  if (config.executionBackend === "modal" && !config.modalTarget) {
    steps.push(
      "Set DOOLITTLE_MODAL_TARGET before relying on the Modal execution backend.",
    );
  }
  if (config.executionBackend === "modal" && !config.modalWorkspacePath) {
    steps.push(
      "Set DOOLITTLE_MODAL_WORKSPACE_PATH before relying on the Modal execution backend.",
    );
  }
  if (!config.modalShell) {
    steps.push(
      "Set DOOLITTLE_MODAL_SHELL to choose the shell used inside Modal sandboxes.",
    );
  }
  if (!config.modalEnvironment) {
    steps.push(
      "Optionally set DOOLITTLE_MODAL_ENVIRONMENT so Modal shells bind to an explicit environment instead of the active profile.",
    );
  }
  if (!config.modalInspectCommand) {
    steps.push(
      "Optionally set DOOLITTLE_MODAL_INSPECT_COMMAND if you want to override the synthesized Modal shell inspect command.",
    );
  }

  return steps;
}
