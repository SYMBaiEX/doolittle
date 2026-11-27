export interface FileEdit {
  baseline: string;
  content: string;
}

export type FileEditMap = ReadonlyMap<string, FileEdit>;

/** Record a draft change, dropping the entry when the draft matches the baseline. */
export function applyFileDraft(
  current: FileEditMap,
  path: string,
  baseline: string,
  value: string,
): FileEditMap {
  const next = new Map(current);
  if (value === baseline) next.delete(path);
  else next.set(path, { baseline, content: value });
  return next;
}

export function discardFileEdit(
  current: FileEditMap,
  path: string,
): FileEditMap {
  if (!current.has(path)) return current;
  const next = new Map(current);
  next.delete(path);
  return next;
}

/** Rebase the baseline after an acknowledged save, keeping newer typing. */
export function acknowledgeFileSave(
  current: FileEditMap,
  path: string,
  savedContent: string,
): FileEditMap {
  const latest = current.get(path);
  const next = new Map(current);
  if (latest && latest.content !== savedContent) {
    next.set(path, { baseline: savedContent, content: latest.content });
  } else {
    next.delete(path);
  }
  return next;
}

export type FileRebaseResult =
  | { kind: "absent" }
  | { kind: "matches" }
  | { kind: "rebased" };

/**
 * Move the edit baseline onto the fresh disk content while keeping the user's
 * draft, so a later save compares against what is actually in the workspace.
 */
export function rebaseFileEdit(
  current: FileEditMap,
  path: string,
  freshContent: string,
): { next: FileEditMap; result: FileRebaseResult } {
  const latest = current.get(path);
  if (!latest) return { next: current, result: { kind: "absent" } };
  if (latest.content === freshContent) {
    return {
      next: discardFileEdit(current, path),
      result: { kind: "matches" },
    };
  }
  const next = new Map(current);
  next.set(path, { baseline: freshContent, content: latest.content });
  return { next, result: { kind: "rebased" } };
}
