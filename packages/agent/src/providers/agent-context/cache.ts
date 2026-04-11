import type {
  AgentContextCacheEntry,
  AgentContextRepoCacheEntry,
  AgentContextScope,
  AgentContextTurnCacheEntry,
} from "./types";

const REPOSITORY_CACHE_TTL_MS = 30_000;
const TURN_CACHE_MAX_SIZE = 64;
const TURN_CACHE_RETAIN_SIZE = 48;
const TURN_CACHE_MAX_AGE_MS = 5 * 60_000;

function getSessionCacheTtl(scope: AgentContextScope): number {
  if (scope === "minimal") {
    return Number.POSITIVE_INFINITY;
  }
  if (scope === "local") {
    return 30_000;
  }
  return 20_000;
}

export class AgentContextCache {
  private readonly sessionScopedCache = new Map<
    string,
    Map<AgentContextScope, AgentContextCacheEntry>
  >();

  private readonly turnScopedCache = new Map<
    string,
    AgentContextTurnCacheEntry
  >();

  private repoCache: AgentContextRepoCacheEntry | undefined;

  getTurn(
    turnKey: string,
    scope: AgentContextScope,
  ): AgentContextCacheEntry | undefined {
    return this.turnScopedCache.get(turnKey)?.scopes.get(scope);
  }

  getSession(
    roomKey: string,
    scope: AgentContextScope,
    now: number,
  ): AgentContextCacheEntry | undefined {
    const sessionCache = this.sessionScopedCache.get(roomKey);
    if (!sessionCache) {
      return undefined;
    }

    const cached = sessionCache.get(scope);
    if (!cached) {
      return undefined;
    }

    if (now - cached.capturedAt >= getSessionCacheTtl(scope)) {
      return undefined;
    }

    return cached;
  }

  resolveRepoSummary(
    now: number,
    loader: () => Promise<string>,
  ): Promise<string> {
    if (
      this.repoCache &&
      now - this.repoCache.capturedAt < REPOSITORY_CACHE_TTL_MS
    ) {
      return Promise.resolve(this.repoCache.summary);
    }

    return loader()
      .then((summary) => {
        this.repoCache = {
          capturedAt: Date.now(),
          summary,
        };
        return summary;
      })
      .catch((error) => {
        const summary = `Repository status unavailable: ${error instanceof Error ? error.message : String(error)}`;
        this.repoCache = {
          capturedAt: Date.now(),
          summary,
        };
        return summary;
      });
  }

  store(
    roomKey: string,
    turnKey: string,
    scope: AgentContextScope,
    entry: AgentContextCacheEntry,
  ): void {
    const sessionCache =
      this.sessionScopedCache.get(roomKey) ??
      (() => {
        const next = new Map<AgentContextScope, AgentContextCacheEntry>();
        this.sessionScopedCache.set(roomKey, next);
        return next;
      })();

    sessionCache.set(scope, entry);

    const frozenTurnEntry = this.turnScopedCache.get(turnKey) ?? {
      capturedAt: Date.now(),
      scopes: new Map<AgentContextScope, AgentContextCacheEntry>(),
    };
    frozenTurnEntry.capturedAt = Date.now();
    frozenTurnEntry.scopes.set(scope, entry);
    this.turnScopedCache.set(turnKey, frozenTurnEntry);

    this.pruneTurnCache();
  }

  private pruneTurnCache(): void {
    if (this.turnScopedCache.size <= TURN_CACHE_MAX_SIZE) {
      return;
    }

    const now = Date.now();
    for (const [key, entry] of this.turnScopedCache.entries()) {
      if (now - entry.capturedAt > TURN_CACHE_MAX_AGE_MS) {
        this.turnScopedCache.delete(key);
      }
      if (this.turnScopedCache.size <= TURN_CACHE_RETAIN_SIZE) {
        break;
      }
    }
  }
}
