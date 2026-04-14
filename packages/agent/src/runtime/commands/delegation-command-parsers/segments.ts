import { parseDelimitedOptions, parseSegmentBody } from "./shared";
import type { DelegationSegments, DelegationSpawnSegments } from "./types";

export function parseDelegationSegments(
  raw: string,
): DelegationSegments | null {
  const parsed = parseSegmentBody(raw);
  if (!parsed) {
    return null;
  }

  const [head, ...rawOptions] = parsed.segments;
  return {
    head,
    objective: parsed.objective,
    options: parseDelimitedOptions(rawOptions),
  };
}

export function parseDelegationSpawnSegments(
  raw: string,
): DelegationSpawnSegments | null {
  const parsed = parseSegmentBody(raw);
  if (!parsed) {
    return null;
  }

  const [parentId, ...rawOptions] = parsed.segments;
  return {
    parentId,
    objective: parsed.objective,
    options: parseDelimitedOptions(rawOptions),
  };
}
