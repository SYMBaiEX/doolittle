import { isBotModelProvider } from "@doolittle/contracts/bots";
import type { RuntimeModelsResponse } from "../../shared/contracts";

export interface BotModelRoute {
  provider: string;
  model: string;
}

export function botModelRoutes(
  catalog: RuntimeModelsResponse | null,
  currentRoute: BotModelRoute,
) {
  const providers = (catalog?.providers ?? [])
    .filter((provider) => isBotModelProvider(provider.id))
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      models: provider.models.map((model) => ({
        id: model.id,
        label: model.label,
        currentRoute: false,
      })),
      currentRoute: false,
    }));
  if (!currentRoute.provider || !currentRoute.model) return providers;
  const currentProvider = providers.find(
    (provider) => provider.id === currentRoute.provider,
  );
  if (currentProvider) {
    if (
      !currentProvider.models.some((model) => model.id === currentRoute.model)
    )
      currentProvider.models.push({
        id: currentRoute.model,
        label: `${currentRoute.model} · Current route`,
        currentRoute: true,
      });
  } else {
    providers.push({
      id: currentRoute.provider,
      label: `${currentRoute.provider} · Current route${isBotModelProvider(currentRoute.provider) ? "" : " · Unavailable for bots"}`,
      models: [
        {
          id: currentRoute.model,
          label: `${currentRoute.model} · Current route`,
          currentRoute: true,
        },
      ],
      currentRoute: true,
    });
  }
  return providers;
}
