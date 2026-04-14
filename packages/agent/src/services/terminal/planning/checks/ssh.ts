import { existsSync } from "node:fs";
import type { DiagnosticCheck } from "@/types/execution";
import type { RuntimeSettings } from "../../../settings/runtime-settings";
import { createCheck } from "../../execution/diagnostics";
import { buildShellCheck } from "./shared";

function buildSshConfigCheck(
  id: string,
  label: string,
  value: string,
  formatter: (value: string) => string,
  missingDetail: string,
): DiagnosticCheck {
  return createCheck(
    id,
    value ? "pass" : "fail",
    label,
    value ? formatter(value) : missingDetail,
  );
}

export function buildSshChecks(
  settings: RuntimeSettings,
  runtimeAvailable: boolean,
  pathExists: boolean,
): DiagnosticCheck[] {
  const execution = settings.execution;
  const keyConfigured = Boolean(execution.sshKeyPath);
  const keyExists = !execution.sshKeyPath || existsSync(execution.sshKeyPath);

  return [
    createCheck(
      "ssh.runtime.binary",
      runtimeAvailable ? "pass" : "fail",
      "SSH client availability",
      runtimeAvailable
        ? "ssh command is available on this host."
        : "ssh command is not available on this host.",
    ),
    buildSshConfigCheck(
      "ssh.config.host",
      "SSH host",
      execution.sshHost,
      (value) => `Host configured: ${value}.`,
      "SSH host is not configured.",
    ),
    buildSshConfigCheck(
      "ssh.config.user",
      "SSH user",
      execution.sshUser,
      (value) => `User configured: ${value}.`,
      "SSH user is not configured.",
    ),
    buildSshConfigCheck(
      "ssh.config.path",
      "Remote workspace",
      execution.sshPath,
      (value) => `Remote workspace path: ${value}.`,
      "Remote workspace path is not configured.",
    ),
    createCheck(
      "ssh.config.key",
      keyConfigured && keyExists ? "pass" : keyConfigured ? "fail" : "warn",
      "SSH key",
      keyConfigured
        ? keyExists
          ? `SSH key found at ${execution.sshKeyPath}.`
          : `SSH key path does not exist: ${execution.sshKeyPath}.`
        : "No SSH private key configured.",
    ),
    createCheck(
      "ssh.runtime.probe",
      pathExists ? "pass" : "fail",
      "Remote workspace probe",
      pathExists
        ? `Remote workspace ${execution.sshPath} is reachable.`
        : `Remote workspace ${execution.sshPath || "?"} is not reachable.`,
    ),
    buildShellCheck(
      "ssh.runtime.shell",
      "Remote shell",
      "Commands execute through sh -lc for portability on the remote host.",
    ),
    createCheck(
      "ssh.runtime.strictHostKeyChecking",
      execution.sshStrictHostKeyChecking ? "pass" : "warn",
      "Host key verification",
      execution.sshStrictHostKeyChecking
        ? "Strict host key checking is enabled."
        : "Strict host key checking is disabled for this session.",
    ),
  ];
}

export function buildSshPreviewChecks(
  settings: RuntimeSettings,
): DiagnosticCheck[] {
  const execution = settings.execution;

  return [
    buildShellCheck(
      "ssh.preview.generated",
      "SSH preview",
      `Execution will run against ${execution.sshUser || "?"}@${execution.sshHost || "?"}.`,
    ),
    buildShellCheck(
      "ssh.preview.shell",
      "Remote shell",
      "Commands execute through sh -lc on the remote host.",
    ),
    createCheck(
      "ssh.preview.path",
      execution.sshPath ? "pass" : "warn",
      "Remote workspace",
      execution.sshPath
        ? `Remote workspace ${execution.sshPath} will be used.`
        : "Remote workspace path is not configured.",
    ),
    createCheck(
      "ssh.preview.key",
      execution.sshKeyPath ? "pass" : "warn",
      "SSH key",
      execution.sshKeyPath
        ? `SSH key path ${execution.sshKeyPath} will be used when available.`
        : "No SSH key path configured.",
    ),
  ];
}
