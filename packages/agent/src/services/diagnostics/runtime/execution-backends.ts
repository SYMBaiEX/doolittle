import type { DiagnosticCheck } from "@/types";
import type {
  DiagnosticsCheckBuilder,
  DiagnosticsExecutionChecksInput,
} from "./types";

export const buildExecutionBackendChecks: DiagnosticsCheckBuilder<
  DiagnosticsExecutionChecksInput
> = ({ config }): DiagnosticCheck[] => [
  {
    id: "daytona.readiness",
    status:
      config.executionBackend === "daytona" && !config.daytonaTarget
        ? "fail"
        : config.daytonaTarget
          ? "pass"
          : "warn",
    summary: "Daytona execution readiness",
    detail: config.daytonaTarget
      ? `Daytona sandbox target configured: ${config.daytonaTarget}. Shell=${config.daytonaCommand || "daytona"} ${config.daytonaShell || "/bin/sh"} workspace=${config.daytonaWorkspacePath || "/workspace"}${config.daytonaSnapshot ? ` snapshot=${config.daytonaSnapshot}` : ""}.`
      : "DOOLITTLE_DAYTONA_TARGET is not configured.",
  },
  {
    id: "daytona.shell",
    status: config.daytonaShell ? "pass" : "warn",
    summary: "Daytona shell strategy",
    detail: config.daytonaShell
      ? `Daytona commands execute through ${config.daytonaShell} with an info probe and exec path.`
      : "Daytona shell strategy is not configured.",
  },
  {
    id: "daytona.snapshot",
    status: config.daytonaSnapshot ? "pass" : "warn",
    summary: "Daytona snapshot reference",
    detail: config.daytonaSnapshot
      ? `Daytona snapshot configured: ${config.daytonaSnapshot}.`
      : "No Daytona snapshot reference configured; the backend will use the live sandbox target.",
  },
  {
    id: "daytona.inspect",
    status: config.daytonaInspectCommand ? "pass" : "warn",
    summary: "Daytona inspect command",
    detail: config.daytonaInspectCommand
      ? `Daytona inspect command configured: ${config.daytonaInspectCommand}.`
      : "Daytona inspect command will be synthesized from the configured target.",
  },
  {
    id: "modal.readiness",
    status:
      config.executionBackend === "modal" && !config.modalTarget
        ? "fail"
        : config.modalTarget
          ? "pass"
          : "warn",
    summary: "Modal execution readiness",
    detail: config.modalTarget
      ? `Modal shell target configured: ${config.modalTarget}. Shell=${config.modalCommand || "modal"} ${config.modalShell || "/bin/bash"} workspace=${config.modalWorkspacePath || "/workspace"}${config.modalEnvironment ? ` env=${config.modalEnvironment}` : ""}.`
      : "DOOLITTLE_MODAL_TARGET is not configured.",
  },
  {
    id: "modal.shell",
    status: config.modalShell ? "pass" : "warn",
    summary: "Modal shell strategy",
    detail: config.modalShell
      ? `Modal shell runs commands through ${config.modalShell} and can be bound to ${config.modalEnvironment || "the active profile"}.`
      : "Modal shell strategy is not configured.",
  },
  {
    id: "modal.environment",
    status: config.modalEnvironment ? "pass" : "warn",
    summary: "Modal environment selection",
    detail: config.modalEnvironment
      ? `Modal environment configured: ${config.modalEnvironment}.`
      : "No explicit Modal environment configured; the active profile will be used.",
  },
  {
    id: "modal.inspect",
    status: config.modalInspectCommand ? "pass" : "warn",
    summary: "Modal inspect command",
    detail: config.modalInspectCommand
      ? `Modal inspect command configured: ${config.modalInspectCommand}.`
      : "Modal inspect command will be synthesized from the configured target.",
  },
];
