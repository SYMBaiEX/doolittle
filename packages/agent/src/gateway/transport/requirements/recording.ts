import type { EnvConfig } from "@/types/runtime";
import type { TransportRequirementDefinition } from "./data";

interface RequirementEvaluation {
  configured: boolean;
  configuredAll: string[];
  configuredAny: string[];
  missingAll: string[];
  missingAny: string[];
  mode: "all" | "any" | "none";
}

export function evaluateTransportRequirement(
  definition: TransportRequirementDefinition,
  config: EnvConfig,
): RequirementEvaluation {
  const requiredAll = definition.requiredAll ?? [];
  const requiredAny = definition.requiredAny ?? [];

  const configuredAll = requiredAll.filter((entry) => entry.configured(config));
  const configuredAny = requiredAny.filter((entry) => entry.configured(config));
  const missingAll = requiredAll.filter((entry) => !entry.configured(config));
  const missingAny = requiredAny.filter((entry) => !entry.configured(config));

  const configured =
    requiredAny.length > 0 ? configuredAny.length > 0 : missingAll.length === 0;

  const mode: RequirementEvaluation["mode"] =
    requiredAny.length > 0 ? "any" : requiredAll.length > 0 ? "all" : "none";

  return {
    configured,
    configuredAll: configuredAll.map((entry) => entry.key),
    configuredAny: configuredAny.map((entry) => entry.key),
    missingAll: missingAll.map((entry) => entry.key),
    missingAny: missingAny.map((entry) => entry.key),
    mode,
  };
}
