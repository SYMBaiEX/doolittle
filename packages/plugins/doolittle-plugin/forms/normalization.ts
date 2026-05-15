import type { FormMetadataValue } from "@doolittle/contracts";
import { DEFAULT_TEMPLATES } from "./constants";
import type { FormTemplateRef } from "./types";

export function isFormMetadataValue(
  value: unknown,
): value is FormMetadataValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isFormMetadataValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value).every((entry) => isFormMetadataValue(entry));
  }
  return false;
}

export function normalizeMetadata(
  metadata: unknown,
): Record<string, FormMetadataValue> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const normalized = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => isFormMetadataValue(value)),
  );

  return normalized;
}

function isTemplateRef(input: unknown): input is FormTemplateRef {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return false;
  }

  const candidate = input as Record<string, unknown>;
  return (
    typeof candidate.id === "string" || typeof candidate.templateId === "string"
  );
}

export function resolveTemplateId(input: unknown): string {
  if (typeof input === "string" && input in DEFAULT_TEMPLATES) {
    return input;
  }
  if (isTemplateRef(input)) {
    const candidate = input.templateId ?? input.id;
    if (typeof candidate === "string" && candidate in DEFAULT_TEMPLATES) {
      return candidate;
    }
  }
  return "project_scaffold";
}
