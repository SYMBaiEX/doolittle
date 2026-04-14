import type { DiagnosticCheck } from "@/types";
import { buildEcosystemChecks } from "./check-builders/ecosystem";
import { buildNativeOwnershipChecks } from "./check-builders/native-ownership";
import { buildProviderChecks } from "./check-builders/provider";
import { buildRuntimeOwnershipChecks } from "./check-builders/runtime";
import type {
  GatewayTransportOverview,
  ProviderOwnershipContext,
} from "./types";

export function buildProviderOwnershipChecks(
  context: ProviderOwnershipContext,
  gatewayTransportOverview?: GatewayTransportOverview,
): DiagnosticCheck[] {
  return [
    ...buildProviderChecks(context),
    ...buildEcosystemChecks(context),
    ...buildNativeOwnershipChecks(context, gatewayTransportOverview),
    ...buildRuntimeOwnershipChecks(context),
  ];
}
