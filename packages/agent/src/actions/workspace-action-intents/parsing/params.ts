import { nonEmptyString } from "../shared/string-helpers";
import type { WorkspaceIntent } from "../types";

export function resolveWorkspaceIntentFromParams(
  params: unknown,
): WorkspaceIntent | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const rawKind = nonEmptyString(record.intent);

  if (rawKind === "tree") {
    return { kind: "tree" };
  }
  if (rawKind === "overview") {
    const path = nonEmptyString(record.path);
    return { kind: "overview", path };
  }
  if (rawKind === "find-codebase") {
    const query = nonEmptyString(record.query);
    return query ? { kind: "find-codebase", query } : undefined;
  }
  return undefined;
}
