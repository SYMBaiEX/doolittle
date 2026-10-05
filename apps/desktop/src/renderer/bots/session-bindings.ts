import type { StorageLike } from "../conversation-persistence";
import { safeSetStorageItem } from "../conversation-persistence";

const KEY = "doolittle.desktop.session-bot-bindings.v1";
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/u.test(value);

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
