import type { DiagnosticCheck } from "@/types";
import type { ProviderOwnershipContext } from "../types";

export function buildRuntimeOwnershipChecks(
  context: ProviderOwnershipContext,
): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const { formsControl, runtimeExecutionControl } = context;

  if (formsControl) {
    checks.push({
      id: "native.forms",
      status: formsControl.available ? "pass" : "warn",
      summary: "Native forms ownership",
      detail: `available=${formsControl.available} templates=${formsControl.templates} total=${formsControl.forms.total} active=${formsControl.forms.active} persistence=${formsControl.persistenceAvailable}`,
    });
  }

  if (runtimeExecutionControl) {
    checks.push(
      {
        id: "native.execution.e2b",
        status: runtimeExecutionControl.e2b.available ? "pass" : "warn",
        summary: "Native E2B sandbox ownership",
        detail: `available=${runtimeExecutionControl.e2b.available} sandboxes=${runtimeExecutionControl.e2b.sandboxes} execution=${runtimeExecutionControl.e2b.supportsExecution} root=${runtimeExecutionControl.e2b.sandboxRoot ?? "n/a"}`,
      },
      {
        id: "native.execution.codegen",
        status: runtimeExecutionControl.codeGeneration.ready ? "pass" : "warn",
        summary: "Native code generation ownership",
        detail: `available=${runtimeExecutionControl.codeGeneration.available} ready=${runtimeExecutionControl.codeGeneration.ready} methods=${runtimeExecutionControl.codeGeneration.methods.join(",") || "none"} github=${runtimeExecutionControl.github.available} secrets=${runtimeExecutionControl.secretsManager.available}`,
      },
    );
  }

  return checks;
}
