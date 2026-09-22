const PREFLIGHT_TIMEOUT_MS = 750;

/** Check reachability and the installed model without pulling or generating. */
export async function checkOllamaReadiness(
  endpoint: string,
  model: string,
  fetchImpl?: typeof fetch | null,
): Promise<{ ready: boolean; detail: string }> {
  let tagsUrl: URL;
  try {
    tagsUrl = new URL(endpoint);
    tagsUrl.pathname = `${tagsUrl.pathname.replace(/\/+$/, "").replace(/\/api$/, "")}/api/tags`;
    tagsUrl.search = "";
    tagsUrl.hash = "";
  } catch {
    return {
      ready: false,
      detail: "Correct OLLAMA_API_ENDPOINT and restart Doolittle.",
    };
  }
  let response: Response;
  try {
    response = await (fetchImpl ?? fetch)(tagsUrl.toString(), {
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
  } catch {
    return {
      ready: false,
      detail:
        "Cannot connect to Ollama. Start it with `ollama serve`, or use /model use to choose another provider.",
    };
  }
  if (!response.ok) {
    return {
      ready: false,
      detail: `Ollama returned HTTP ${response.status}. Check its endpoint and authentication.`,
    };
  }
  try {
    const payload = await response.json();
    if (!Array.isArray(payload.models))
      throw new Error("Invalid model catalog");
    const installed = payload.models.some((entry: unknown) => {
      if (typeof entry !== "object" || entry === null) return false;
      const candidate =
        "name" in entry
          ? entry.name
          : "model" in entry
            ? entry.model
            : undefined;
      return (
        typeof candidate === "string" &&
        candidate.replace(/:latest$/, "") === model.replace(/:latest$/, "")
      );
    });
    return installed
      ? {
          ready: true,
          detail: "Ollama is reachable and the model is installed.",
        }
      : {
          ready: false,
          detail: `The Ollama model ${model} is not installed. Install it with 'ollama pull ${model}'.`,
        };
  } catch {
    return {
      ready: false,
      detail:
        "Ollama returned an invalid model catalog. Check OLLAMA_API_ENDPOINT.",
    };
  }
}
