import type { TransportRequirementDefinition } from "./data";

export function buildRequirementSummary(
  definition: TransportRequirementDefinition,
  configuredKeys: string[],
  missingKeys: string[],
): string {
  if (definition.requiredAny?.length) {
    return configuredKeys.length
      ? `${definition.label} transport configured via ${configuredKeys.join(" or ")}.`
      : `${definition.requiredAny.map((entry) => entry.key).join(" or ")} should be configured.`;
  }

  if (!missingKeys.length) {
    return `${definition.label} transport configured.`;
  }

  return `${missingKeys.join(" and ")} ${missingKeys.length === 1 ? "is" : "are"} not configured.`;
}

export function buildChecklist(
  definition: TransportRequirementDefinition,
  missingKeys: string[],
): string | null {
  if (!missingKeys.length) {
    return null;
  }

  if (definition.requiredAny?.length) {
    return `Set ${definition.requiredAny.map((entry) => entry.key).join(" or ")} before enabling the ${definition.label} gateway path.`;
  }

  return `Set ${missingKeys.join(", ")} before enabling the ${definition.label} gateway path.`;
}
