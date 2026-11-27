// A loopback catalog request is normally immediate, but a saturated test or
// operator host can schedule the server hundreds of milliseconds late. Down
// endpoints still refuse the connection quickly; this bound only caps a truly
// hung HTTP server.
const PREFLIGHT_TIMEOUT_MS = 2_000;
// Readiness is checked once before the turn and again inside the guarded model
// handler. Keep fresh positives so those defense-in-depth checks do not turn
// into serial network round trips on every generation. Negative results stay
// uncached so starting Ollama or pulling a model is picked up immediately.
const READY_PROBE_CACHE_TTL_MS = 30_000;

const readyProbeCache = new WeakMap<object, Map<string, number>>();

function cachedReadyProbe(fetchImpl: typeof fetch, key: string): boolean {
  const byEndpoint = readyProbeCache.get(fetchImpl as object);
  const expiresAt = byEndpoint?.get(key);
  if (expiresAt === undefined) return false;
  if (expiresAt > Date.now()) return true;
  byEndpoint?.delete(key);
  return false;
}

function rememberReadyProbe(fetchImpl: typeof fetch, key: string): void {
  let byEndpoint = readyProbeCache.get(fetchImpl as object);
  if (!byEndpoint) {
    byEndpoint = new Map();
    readyProbeCache.set(fetchImpl as object, byEndpoint);
  }
  byEndpoint.set(key, Date.now() + READY_PROBE_CACHE_TTL_MS);
}

export type OllamaModelStatus =
  | {
      state:
        | "ready"
        | "invalid_endpoint"
        | "unreachable"
        | "invalid_response"
        | "missing_catalog"
        | "missing_model";
    }
  | { state: "http_error"; status: number };

/** Resolve the native catalog from either a server or OpenAI-compatible URL. */
export function resolveOllamaTagsUrl(endpoint: string): string | undefined {
  try {
    const url = new URL(endpoint);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    const path = url.pathname.replace(/\/+$/u, "");
    const apiBoundary = path.match(/^(.*?)(?:\/api|\/v1)(?:\/.*)?$/u);
    url.pathname = `${apiBoundary?.[1] ?? path}/api/tags`.replace(
      /\/{2,}/gu,
      "/",
    );
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

/**
 * Check reachability and inventory without pulling or generating. Fresh
 * positive results are reused briefly; negative results always probe live.
 */
export async function probeOllamaModel(
  endpoint: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaModelStatus> {
  const url = resolveOllamaTagsUrl(endpoint);
  if (!url) return { state: "invalid_endpoint" };
  const selected = model.trim().replace(/:latest$/u, "");
  const cacheKey = `${url}\u0000${selected}`;
  if (cachedReadyProbe(fetchImpl, cacheKey)) {
    return { state: "ready" };
  }

  let response: Response;
  try {
    response = await fetchImpl(url, {
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
  } catch {
    return { state: "unreachable" };
  }
  if (!response.ok) return { state: "http_error", status: response.status };
  if (!model.trim()) return { state: "ready" };

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { state: "invalid_response" };
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !("models" in payload) ||
    !Array.isArray(payload.models)
  ) {
    return { state: "missing_catalog" };
  }

  const installed = payload.models.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate =
      "name" in entry ? entry.name : "model" in entry ? entry.model : undefined;
    return (
      typeof candidate === "string" &&
      candidate.trim().replace(/:latest$/u, "") === selected
    );
  });
  if (installed) {
    rememberReadyProbe(fetchImpl, cacheKey);
  }
  return { state: installed ? "ready" : "missing_model" };
}
