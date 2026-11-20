import type { AgentExecutionContext } from "../chat";
import { resolveLinkedProviderCredentials } from "../native/account-auth/index";
import { validateCloudBaseUrl } from "./cloud-url";
import { normalizeElizaCloudBaseUrl } from "./messages";

export async function describeElizaCloudDoctorState(
  context: AgentExecutionContext,
): Promise<{
  configuredBaseUrl: string;
  normalizedBaseUrl: string;
  baseUrlValidation: string | null;
  credentialSource: string;
  authMode: string;
  hasApiKey: boolean;
}> {
  const settings = context.services.settings.get();
  const credentials = await resolveLinkedProviderCredentials("elizacloud");
  const fallbackBaseUrl =
    (settings.model.provider === "elizacloud"
      ? settings.model.baseUrl
      : context.config.elizaCloudBaseUrl) || resolveDefaultCloudBaseUrl();
  const configuredBaseUrl =
    (settings.model.provider === "elizacloud"
      ? settings.model.baseUrl
      : context.config.elizaCloudBaseUrl) || fallbackBaseUrl;
  const normalizedBaseUrl = normalizeElizaCloudBaseUrl(
    credentials && "baseUrl" in credentials
      ? credentials.baseUrl || configuredBaseUrl
      : configuredBaseUrl,
  );

  return {
    configuredBaseUrl,
    normalizedBaseUrl,
    baseUrlValidation: await validateCloudBaseUrl(normalizedBaseUrl),
    credentialSource:
      credentials && "source" in credentials && credentials.source?.trim()
        ? credentials.source
        : "missing",
    authMode:
      credentials && "authMode" in credentials && credentials.authMode?.trim()
        ? credentials.authMode
        : "missing",
    hasApiKey: Boolean(
      credentials && "apiKey" in credentials && credentials.apiKey?.trim(),
    ),
  };
}

function resolveDefaultCloudBaseUrl(): string {
  return normalizeElizaCloudBaseUrl();
}
