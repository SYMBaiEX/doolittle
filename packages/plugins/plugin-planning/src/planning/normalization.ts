import type { StoredPlanRecord } from "@doolittle/contracts";

const FALLBACK_STEPS = [
  "Clarify scope and runtime dependencies.",
  "Execute through native ElizaOS services and plugins.",
  "Validate the result with lint, typecheck, tests, and build.",
];

export function normalizeSteps(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [...FALLBACK_STEPS];
  }
  const steps = input
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return steps.length > 0 ? steps : [...FALLBACK_STEPS];
}

export function normalizeStatus(input: unknown): StoredPlanRecord["status"] {
  return input === "completed" || input === "draft" ? input : "active";
}

export function normalizeMetadata(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? { ...(input as Record<string, unknown>) }
    : {};
}

export function normalizeText(input: unknown, fallback: string): string {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}
