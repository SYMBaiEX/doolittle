const PREFLIGHT_TIMEOUT_MS = 750;

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

/** Check reachability and inventory without pulling or generating. */
export async function probeOllamaModel(
  endpoint: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaModelStatus> {
  const url = resolveOllamaTagsUrl(endpoint);
  if (!url) return { state: "invalid_endpoint" };

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

  const selected = model.trim().replace(/:latest$/u, "");
  const installed = payload.models.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const candidate =
      "name" in entry ? entry.name : "model" in entry ? entry.model : undefined;
    return (
      typeof candidate === "string" &&
      candidate.trim().replace(/:latest$/u, "") === selected
    );
  });
  return { state: installed ? "ready" : "missing_model" };
}
