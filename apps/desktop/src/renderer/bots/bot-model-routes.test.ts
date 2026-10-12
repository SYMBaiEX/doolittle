import { describe, expect, it } from "vitest";
import type { RuntimeModelsResponse } from "../../shared/contracts";
import { botModelRoutes } from "./bot-model-routes";

describe("named bot model routes", () => {
  it("excludes catalog providers without a host-scoped bridge", () => {
    const catalog = {
      providers: ["openai", "ollama", "elizacloud", "devin"].map((id) => ({
        id,
        label: id,
        models: [{ id: "model", label: "Model" }],
      })),
    } as RuntimeModelsResponse;
    expect(
      botModelRoutes(catalog, { provider: "openai", model: "model" }).map(
        (provider) => provider.id,
      ),
    ).toEqual(["openai"]);
  });
  it("keeps unsupported existing routes visibly unavailable, not silently remapped", () => {
    const routes = botModelRoutes(null, {
      provider: "ollama",
      model: "local-model",
    });
    expect(routes[0]).toMatchObject({
      id: "ollama",
      label: "ollama · Current route · Unavailable for bots",
    });
  });
});
