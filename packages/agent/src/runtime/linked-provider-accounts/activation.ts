import { getLinkedProviderAccountsSnapshot } from "@/runtime/native/account-auth";
import type { AgentExecutionContext } from "../chat";
import { normalizeElizaCloudBaseUrl } from "./messages";
import {
  resolveDefaultProviderBaseUrl,
  resolveDefaultProviderModel,
  syncProviderSettings,
} from "./model-settings";
import type { LinkedProviderName } from "./types";

export function activateLinkedProvider(
  context: AgentExecutionContext,
  provider: LinkedProviderName,
): {
  provider: LinkedProviderName;
  model: string;
  baseUrl: string;
  accounts: ReturnType<typeof getLinkedProviderAccountsSnapshot>;
} {
  const settings = context.services.settings.get();
  const nextModel =
    settings.model.provider === provider && settings.model.model.trim()
      ? settings.model.model
      : resolveDefaultProviderModel(context, provider);
  const nextBaseUrl =
    settings.model.provider === provider
      ? settings.model.baseUrl
      : resolveDefaultProviderBaseUrl(provider);
  const normalizedBaseUrl =
    provider === "elizacloud"
      ? normalizeElizaCloudBaseUrl(nextBaseUrl)
      : nextBaseUrl;

  context.services.settings.set("model.provider", provider);
  context.services.settings.set("model.model", nextModel);
  context.services.settings.set("model.baseUrl", normalizedBaseUrl);
  const updated = context.services.settings.get();
  syncProviderSettings(context, updated);

  return {
    provider,
    model: updated.model.model,
    baseUrl: updated.model.baseUrl,
    accounts: getLinkedProviderAccountsSnapshot(),
  };
}
