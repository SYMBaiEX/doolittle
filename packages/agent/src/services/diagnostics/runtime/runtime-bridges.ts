import type { DiagnosticCheck } from "@/types";
import type {
  DiagnosticsCheckBuilder,
  DiagnosticsExecutionChecksInput,
} from "./types";

export const buildRuntimeBridgeChecks: DiagnosticsCheckBuilder<
  DiagnosticsExecutionChecksInput
> = ({
  config,
  runtimeExecutionControl,
  agentEventBridgeAttached,
}): DiagnosticCheck[] => [
  {
    id: "browser.backend",
    status:
      config.browserProvider === "lightpanda" && !config.browserCommand
        ? "fail"
        : "pass",
    summary: "Browser backend configuration",
    detail:
      config.browserProvider === "lightpanda"
        ? `Lightpanda is configured as the default browser backend via ${config.browserCommand}.`
        : "Basic HTTP fetch mode is configured as the browser fallback.",
  },
  {
    id: "provider.offline-bootstrap",
    status: config.offlineBootstrapMode ? "warn" : "pass",
    summary: "Explicit offline bootstrap fallback",
    detail: config.offlineBootstrapMode
      ? "Offline bootstrap mode is enabled; product fallback models may answer when no official provider is configured."
      : "Offline bootstrap mode is disabled; a real provider is required for model-backed answers.",
  },
  {
    id: "runtime.approvals",
    status: runtimeExecutionControl?.approvals.available ? "pass" : "warn",
    summary: "Native approval service bridge",
    detail: runtimeExecutionControl
      ? `native=${runtimeExecutionControl.approvals.available} asyncRequest=${runtimeExecutionControl.approvals.asyncRequest} selectionHandling=${runtimeExecutionControl.approvals.selectionHandling}`
      : "Runtime not attached; approval bridge cannot be inspected.",
  },
  {
    id: "runtime.agent-events",
    status:
      runtimeExecutionControl?.agentEvents.available && agentEventBridgeAttached
        ? "pass"
        : "warn",
    summary: "Native agent-event progress stream",
    detail: runtimeExecutionControl
      ? `native=${runtimeExecutionControl.agentEvents.available} heartbeat=${runtimeExecutionControl.agentEvents.heartbeat} lastHeartbeat=${runtimeExecutionControl.agentEvents.lastHeartbeatStatus ?? "none"} bridge=${agentEventBridgeAttached}`
      : "Runtime not attached; agent-event bridge cannot be inspected.",
  },
  {
    id: "runtime.tool-policy",
    status: runtimeExecutionControl?.toolPolicy.available ? "pass" : "warn",
    summary: "Native tool policy service",
    detail: runtimeExecutionControl
      ? `native=${runtimeExecutionControl.toolPolicy.available} actions=${runtimeExecutionControl.toolPolicy.actions} codingAllowed=${runtimeExecutionControl.toolPolicy.codingAllowed} messagingAllowed=${runtimeExecutionControl.toolPolicy.messagingAllowed} fullAllowed=${runtimeExecutionControl.toolPolicy.fullAllowed}`
      : "Runtime not attached; tool policy bridge cannot be inspected.",
  },
];
