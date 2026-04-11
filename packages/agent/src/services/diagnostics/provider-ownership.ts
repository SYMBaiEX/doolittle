import { buildProviderOwnershipChecks } from "./provider-ownership/checks";
import { collectProviderOwnershipContext } from "./provider-ownership/context";
import type {
  DiagnosticsProviderOwnershipChecksInput,
  DiagnosticsProviderOwnershipChecksResult,
} from "./provider-ownership/types";

export type {
  DiagnosticsProviderOwnershipChecksInput,
  DiagnosticsProviderOwnershipChecksResult,
};

export async function buildDiagnosticsProviderOwnershipChecks(
  input: DiagnosticsProviderOwnershipChecksInput,
): Promise<DiagnosticsProviderOwnershipChecksResult> {
  const context = await collectProviderOwnershipContext({
    config: input.config,
    gatewayConfig: input.gatewayConfig,
    runtime: input.runtime,
    nativeOwnership: input.nativeOwnership,
    agentSdk: input.agentSdk,
    ecosystemService: input.ecosystemService,
  });

  const checks = buildProviderOwnershipChecks(
    context,
    input.gatewayTransportOverview,
  );

  return {
    checks,
    integrationControl: context.integrationControl,
    runtimeExecutionControl: context.runtimeExecutionControl,
  };
}
