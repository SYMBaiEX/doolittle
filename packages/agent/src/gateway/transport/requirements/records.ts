import type { GatewayConfig, PlatformName } from "@/types/gateway";
import type { EnvConfig } from "@/types/runtime";
import type { TransportRequirementRecord } from "../types";
import { TRANSPORT_REQUIREMENTS } from "./data";
import { evaluateTransportRequirement } from "./recording";
import { buildChecklist, buildRequirementSummary } from "./summary";

export function getTransportRequirementRecords(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
): TransportRequirementRecord[] {
  return TRANSPORT_REQUIREMENTS.map((definition) => {
    const enabled =
      gatewayConfig.platforms[definition.platform]?.enabled ?? false;
    const evaluation = evaluateTransportRequirement(definition, config);

    const status: TransportRequirementRecord["status"] = enabled
      ? evaluation.configured
        ? "pass"
        : "fail"
      : evaluation.configured
        ? "pass"
        : "warn";

    return {
      platform: definition.platform,
      label: definition.label,
      enabled,
      configured: evaluation.configured,
      missing:
        evaluation.mode === "any"
          ? evaluation.configured
            ? []
            : evaluation.missingAny
          : evaluation.missingAll,
      mode: evaluation.mode,
      summary: buildRequirementSummary(
        definition,
        [...evaluation.configuredAll, ...evaluation.configuredAny],
        evaluation.mode === "any"
          ? evaluation.configured
            ? []
            : evaluation.missingAny
          : evaluation.missingAll,
      ),
      checklist: buildChecklist(
        definition,
        evaluation.mode === "any"
          ? evaluation.configured
            ? []
            : evaluation.missingAny
          : evaluation.missingAll,
      ),
      status,
    };
  });
}

export function getTransportRequirementRecord(
  config: EnvConfig,
  gatewayConfig: GatewayConfig,
  platform: PlatformName,
): TransportRequirementRecord | undefined {
  return getTransportRequirementRecords(config, gatewayConfig).find(
    (entry) => entry.platform === platform,
  );
}
