import { probeOllamaModel } from "@doolittle/provider-transport";

export async function checkOllamaReadiness(
  endpoint: string,
  model: string,
  fetchImpl?: typeof fetch | null,
): Promise<{ ready: boolean; detail: string }> {
  const result = await probeOllamaModel(endpoint, model, fetchImpl ?? fetch);
  switch (result.state) {
    case "ready":
      return {
        ready: true,
        detail: "Ollama is reachable and the model is installed.",
      };
    case "invalid_endpoint":
      return {
        ready: false,
        detail: "Correct OLLAMA_API_ENDPOINT and restart Doolittle.",
      };
    case "unreachable":
      return {
        ready: false,
        detail:
          "Cannot connect to Ollama. Start it with `ollama serve`, or use /model use to choose another provider.",
      };
    case "http_error":
      return {
        ready: false,
        detail: `Ollama returned HTTP ${result.status}. Check its endpoint and authentication.`,
      };
    case "missing_model":
      return {
        ready: false,
        detail: `The Ollama model ${model} is not installed. Install it with 'ollama pull ${model}'.`,
      };
    case "invalid_response":
    case "missing_catalog":
      return {
        ready: false,
        detail:
          "Ollama returned an invalid model catalog. Check OLLAMA_API_ENDPOINT.",
      };
  }
}
