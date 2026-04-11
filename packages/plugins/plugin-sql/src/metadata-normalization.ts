import type { Metadata, MetadataValue } from "@elizaos/core";

export function normalizeRelationshipTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return Array.from(
      new Set(
        tags
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  if (tags instanceof Set) {
    return normalizeRelationshipTags(Array.from(tags));
  }

  if (
    tags &&
    typeof tags === "object" &&
    typeof (tags as Iterable<unknown>)[Symbol.iterator] === "function"
  ) {
    return normalizeRelationshipTags(Array.from(tags as Iterable<unknown>));
  }

  return [];
}

function toMetadataValue(value: unknown): MetadataValue {
  if (
    value == null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toMetadataValue(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, toMetadataValue(item)]),
    );
  }

  return String(value);
}

export function normalizeRelationshipMetadata(metadata: unknown): Metadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      toMetadataValue(value),
    ]),
  );
}

export function mergeRelationshipMetadata(
  existing: unknown,
  incoming: unknown,
): Metadata {
  return {
    ...normalizeRelationshipMetadata(existing),
    ...normalizeRelationshipMetadata(incoming),
  };
}
