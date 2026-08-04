import type { GenerateTextParams, IAgentRuntime } from "@elizaos/core";
import {
  createProviderHttpError,
  getRuntimeModelSettings,
  getRuntimeProvider,
  normalizeProviderTransportError,
  ProviderTransportError,
  resolveModelPromptText,
} from "@elizaos/provider-transport";
import {
  DEFAULT_CODEX_BASE_URL,
  DEFAULT_CODEX_INSTRUCTIONS,
  DEFAULT_CODEX_MODEL,
} from "./constants";
import { readCodexResponseText } from "./sse";
import type { CodexPluginOptions } from "./types";

const CODEX_REQUEST_TIMEOUT_MS = 120_000;

interface CodexRequestPayload {
  model: string;
  instructions: string;
  input: Array<{
    role: string;
    content: Array<{
      type: string;
      text: string;
    }>;
  }>;
  stream: boolean;
  store: boolean;
  reasoning?: {
    effort: string;
  };
}

function codexRequestHeaders(credentials: {
  accessToken: string;
  accountId?: string;
}): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.accessToken}`,
    "Content-Type": "application/json",
    Accept: "text/event-stream",
    ...(credentials.accountId?.trim()
      ? { "ChatGPT-Account-Id": credentials.accountId.trim() }
      : {}),
  };
}

function codexRequestSignal(params: GenerateTextParams): AbortSignal {
  const callerSignal = (params as GenerateTextParams & { signal?: AbortSignal })
    .signal;
  const timeoutSignal = AbortSignal.timeout(CODEX_REQUEST_TIMEOUT_MS);
  return callerSignal
    ? AbortSignal.any([callerSignal, timeoutSignal])
    : timeoutSignal;
}

function createCodexRequestPayload(
  params: GenerateTextParams,
  runtimeModel: { model?: string; reasoningEffort?: string },
): CodexRequestPayload {
  const effort = runtimeModel.reasoningEffort?.trim();
  return {
    model: runtimeModel.model || DEFAULT_CODEX_MODEL,
    instructions: DEFAULT_CODEX_INSTRUCTIONS,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: resolveModelPromptText(params),
          },
        ],
      },
    ],
    stream: true,
    store: false,
    ...(effort ? { reasoning: { effort } } : {}),
  };
}

export async function runCodexTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: CodexPluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "codex") {
    throw new ProviderTransportError(
      `Codex model handler is active, but runtime provider is ${provider}. Restart with the Codex provider selected to use this plugin directly.`,
      {
        code: "incompatible_provider",
        provider: "codex",
        detail: provider,
      },
    );
  }

  const refreshCredentials = async () => {
    try {
      return await options.refreshCredentials?.();
    } catch (error) {
      throw normalizeProviderTransportError(
        "codex",
        "credential refresh",
        error,
      );
    }
  };
  let credentials = options.getCredentials?.();
  if (!credentials?.accessToken?.trim() && options.refreshCredentials) {
    credentials = await refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();
  if (!accessToken) {
    throw new ProviderTransportError(
      "No reusable linked Codex access token is available for the Codex provider.",
      {
        code: "no_credentials",
        provider: "codex",
      },
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const endpoint = `${runtimeModel.baseUrl || DEFAULT_CODEX_BASE_URL}/responses`;
  const signal = codexRequestSignal(params);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: codexRequestHeaders({
        accessToken,
        accountId: credentials?.accountId,
      }),
      body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
      signal,
    });
  } catch (error) {
    throw normalizeProviderTransportError("codex", "responses request", error);
  }

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: codexRequestHeaders({
            accessToken: refreshedAccessToken,
            accountId: refreshed?.accountId,
          }),
          body: JSON.stringify(createCodexRequestPayload(params, runtimeModel)),
          signal,
        });
      } catch (error) {
        throw normalizeProviderTransportError(
          "codex",
          "responses refresh request",
          error,
        );
      }
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw createProviderHttpError({
      provider: "codex",
      operation: "responses request",
      status: response.status,
      detail: body,
    });
  }

  return readCodexResponseText(response);
}
