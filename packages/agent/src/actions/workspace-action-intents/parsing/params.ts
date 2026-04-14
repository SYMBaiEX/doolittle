import { nonEmptyString } from "../shared/string-helpers";
import type { WorkspaceIntent } from "../types";

export function resolveWorkspaceIntentFromParams(
  params: unknown,
): WorkspaceIntent | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const rawKind =
    nonEmptyString(record.intent) ??
    nonEmptyString(record.action) ??
    nonEmptyString(record.mode);

  if (rawKind === "tree") {
    return { kind: "tree" };
  }
  if (rawKind === "overview") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.target) ??
      nonEmptyString(record.project);
    return { kind: "overview", path };
  }
  if (rawKind === "read") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    return path ? { kind: "read", path } : undefined;
  }
  if (rawKind === "search") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.term) ??
      nonEmptyString(record.pattern);
    return query ? { kind: "search", query } : undefined;
  }
  if (rawKind === "write") {
    const path =
      nonEmptyString(record.path) ??
      nonEmptyString(record.file) ??
      nonEmptyString(record.target);
    const content =
      nonEmptyString(record.content) ?? nonEmptyString(record.text);
    return path && content ? { kind: "write", path, content } : undefined;
  }
  if (rawKind === "find-codebase") {
    const query =
      nonEmptyString(record.query) ??
      nonEmptyString(record.name) ??
      nonEmptyString(record.term);
    return query ? { kind: "find-codebase", query } : undefined;
  }
  return undefined;
}
