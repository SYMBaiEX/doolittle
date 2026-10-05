import type { StorageLike } from "../conversation-persistence";
import { safeSetStorageItem } from "../conversation-persistence";

const KEY = "doolittle.desktop.session-bot-bindings.v1";
const PROJECT_KEY = "doolittle.desktop.session-project-bindings.v1";
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/u.test(value);

export function loadSessionProjectBindings(
  storage: StorageLike,
): Record<string, string | null> {
  try {
    const raw = storage.getItem(PROJECT_KEY);
    if (!raw || raw.length > 150_000) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(
          ([session, project]) =>
            validId(session) && (project === null || validId(project)),
        )
        .slice(-500),
    );
  } catch {
    return {};
  }
}

export function saveSessionProjectBindings(
  storage: StorageLike,
  bindings: Readonly<Record<string, string | null>>,
): boolean {
  return safeSetStorageItem(
    storage,
    PROJECT_KEY,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(bindings)
          .filter(
            ([session, project]) =>
              validId(session) && (project === null || validId(project)),
          )
          .slice(-500),
      ),
    ),
  );
}

/** Absence is unknown, while an explicit null is a captured unscoped draft. Saved ownership always wins. */
export function sessionProjectTarget(
  sessionId: string,
  sessions: readonly { sessionId: string; projectId?: string | null }[],
  bindings: Readonly<Record<string, string | null>>,
): { projectId?: string } | undefined {
  const saved = sessions.find((session) => session.sessionId === sessionId);
  const project = saved
    ? saved.projectId
    : Object.hasOwn(bindings, sessionId)
      ? bindings[sessionId]
      : undefined;
  return saved || project !== undefined
    ? project
      ? { projectId: project }
      : {}
    : undefined;
}

/** Presentation cache only. Every operation still rechecks the native ownership ledger. */
export function loadSessionBindings(
  storage: StorageLike,
): Record<string, string> {
  try {
    const raw = storage.getItem(KEY);
    if (!raw || raw.length > 150_000) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([session, bot]) => validId(session) && validId(bot))
        .slice(-500),
    );
  } catch {
    return {};
  }
}

export function saveSessionBindings(
  storage: StorageLike,
  bindings: Readonly<Record<string, string>>,
): boolean {
  return safeSetStorageItem(
    storage,
    KEY,
    JSON.stringify(
      Object.fromEntries(
        Object.entries(bindings)
          .filter(([session, bot]) => validId(session) && validId(bot))
          .slice(-500),
      ),
    ),
  );
}
