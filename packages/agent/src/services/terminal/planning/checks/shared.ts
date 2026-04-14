import { existsSync } from "node:fs";
import type { DiagnosticCheck } from "@/types/execution";
import { createCheck } from "../../execution/diagnostics";

export function buildWorkspaceCheck(
  id: string,
  label: string,
  workspaceDir: string,
  successDetail: string,
): DiagnosticCheck {
  return createCheck(
    id,
    existsSync(workspaceDir) ? "pass" : "warn",
    label,
    existsSync(workspaceDir)
      ? successDetail
      : `Workspace directory ${workspaceDir} is not present.`,
  );
}

export function buildShellCheck(
  id: string,
  label: string,
  detail: string,
): DiagnosticCheck {
  return createCheck(id, "pass", label, detail);
}

export function buildLimitsCheck(
  id: string,
  label: string,
  cpuLimit?: string,
  memoryLimit?: string,
  pidsLimit?: number,
): DiagnosticCheck {
  return createCheck(
    id,
    "pass",
    label,
    `cpus=${cpuLimit ?? "2"} memory=${memoryLimit ?? "2g"} pids=${pidsLimit ?? 256}`,
  );
}

export function buildContainerRootfsCheck(
  id: string,
  label: string,
  readOnlyRoot: boolean,
  passDetail: string,
  warnDetail: string,
): DiagnosticCheck {
  return createCheck(
    id,
    readOnlyRoot ? "pass" : "warn",
    label,
    readOnlyRoot ? passDetail : warnDetail,
  );
}
