import {
  Service as ElizaService,
  type GenerateTextParams,
  type IAgentRuntime,
  ModelType,
  type Plugin,
} from "@elizaos/core";

interface LinkedAccountStatus {
  provider: string;
  available: boolean;
  reusable: boolean;
  source?: string;
  authMode?: string;
  lastRefresh?: string;
  accountLabel?: string;
  detail: string;
}

interface CodexPluginOptions {
  enabled?: boolean;
  getStatus: () => LinkedAccountStatus;
  getCredentials?: () =>
    | {
        accessToken?: string;
        refreshToken?: string;
        authMode?: string;
        lastRefresh?: string;
        source?: string;
      }
    | undefined;
  refreshCredentials?: () => Promise<
    | {
        accessToken?: string;
        refreshToken?: string;
        authMode?: string;
        lastRefresh?: string;
        source?: string;
      }
    | undefined
  >;
}

export interface CodexLiveGenerateParams {
  prompt: string;
  maxTokens?: number;
}

const DEFAULT_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const DEFAULT_CODEX_MODEL = "gpt-5.4";
const DEFAULT_CODEX_INSTRUCTIONS =
  "You are Codex, operating as an ElizaOS-native coding agent. Be concise, accurate, and useful.";

function extractCodexEventText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const event = payload as {
    type?: string;
    delta?: string;
    text?: string;
    output_text?: string;
    response?: {
      output_text?: string;
      output?: Array<{
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };
    item?: {
      content?: Array<{ type?: string; text?: string }>;
    };
  };

  if (typeof event.delta === "string" && event.delta.trim()) {
    return event.delta;
  }

  if (typeof event.text === "string" && event.text.trim()) {
    return event.text;
  }

  if (typeof event.output_text === "string" && event.output_text.trim()) {
    return event.output_text;
  }

  const responseText =
    event.response?.output_text?.trim() ||
    event.response?.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" || item.type === "text")
      .map((item) => item.text ?? "")
      .join("")
      .trim();
  if (responseText) {
    return responseText;
  }

  const itemText = event.item?.content
    ?.filter((item) => item.type === "output_text" || item.type === "text")
    .map((item) => item.text ?? "")
    .join("")
    .trim();
  return itemText || "";
}

function mergeCodexOutput(current: string, next: string): string {
  if (!next.trim()) {
    return current;
  }
  if (!current.trim()) {
    return next;
  }
  if (current === next || current.endsWith(next)) {
    return current;
  }
  if (next.includes(current)) {
    return next;
  }
  return current + next;
}

function extractCodexTextFromEventStream(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n");
  const events = normalized.split("\n\n");
  let output = "";

  for (const rawEvent of events) {
    const dataLines = rawEvent
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.replace(/^data:\s?/, "").trim())
      .filter(Boolean);

    for (const line of dataLines) {
      if (line === "[DONE]") {
        continue;
      }
      try {
        output = mergeCodexOutput(
          output,
          extractCodexEventText(JSON.parse(line)),
        );
      } catch {
        output = mergeCodexOutput(output, line);
      }
    }
  }

  return output.trim();
}

async function readCodexResponseText(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    const raw = await response.text();
    try {
      const data = JSON.parse(raw) as {
        output_text?: string;
        output?: Array<{
          type?: string;
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };

      const directText = data.output_text?.trim();
      if (directText) {
        return directText;
      }

      const contentText = data.output
        ?.flatMap((item) => item.content ?? [])
        .filter((item) => item.type === "output_text" || item.type === "text")
        .map((item) => item.text ?? "")
        .join("")
        .trim();

      return contentText || raw.trim() || "No response returned.";
    } catch {
      const streamed = raw.includes("data:")
        ? extractCodexTextFromEventStream(raw)
        : "";
      return streamed || raw.trim() || "No response returned.";
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return "No response returned.";
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      break;
    }
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      output = mergeCodexOutput(
        output,
        extractCodexTextFromEventStream(rawEvent),
      );

      boundary = buffer.indexOf("\n\n");
    }
  }

  const trailing = buffer.trim();
  if (trailing.startsWith("data:")) {
    const line = trailing.replace(/^data:\s?/, "").trim();
    if (line && line !== "[DONE]") {
      try {
        output = mergeCodexOutput(
          output,
          extractCodexEventText(JSON.parse(line)),
        );
      } catch {
        output = mergeCodexOutput(output, line);
      }
    }
  }

  return output.trim() || "No response returned.";
}

function getRuntimeProvider(
  runtime: IAgentRuntime | undefined,
): string | undefined {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return undefined;
    }
    const parsed = JSON.parse(raw) as {
      model?: { provider?: string };
    };
    return parsed.model?.provider;
  } catch {
    return undefined;
  }
}

function getRuntimeModelSettings(runtime: IAgentRuntime | undefined): {
  model?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
} {
  try {
    const raw = runtime?.getSetting("runtimeSettings");
    if (typeof raw !== "string") {
      return {};
    }
    const parsed = JSON.parse(raw) as {
      model?: {
        model?: string;
        baseUrl?: string;
        temperature?: number;
        maxTokens?: number;
      };
    };
    return parsed.model ?? {};
  } catch {
    return {};
  }
}

async function runCodexTextGeneration(
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  options: CodexPluginOptions,
): Promise<string> {
  const provider = getRuntimeProvider(runtime);
  if (provider && provider !== "codex") {
    throw new Error(
      `Codex model handler is active, but runtime provider is ${provider}. Restart with the Codex provider selected to use this plugin directly.`,
    );
  }

  let credentials = options.getCredentials?.();
  if (!credentials?.accessToken?.trim() && options.refreshCredentials) {
    credentials = await options.refreshCredentials();
  }
  const accessToken = credentials?.accessToken?.trim();
  if (!accessToken) {
    throw new Error(
      "No reusable linked Codex access token is available for the Codex provider.",
    );
  }

  const runtimeModel = getRuntimeModelSettings(runtime);
  const endpoint = `${runtimeModel.baseUrl || DEFAULT_CODEX_BASE_URL}/responses`;
  let response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: runtimeModel.model || DEFAULT_CODEX_MODEL,
      instructions: DEFAULT_CODEX_INSTRUCTIONS,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: params.prompt,
            },
          ],
        },
      ],
      stream: true,
      store: false,
    }),
  });

  if (
    (response.status === 401 || response.status === 403) &&
    options.refreshCredentials
  ) {
    const refreshed = await options.refreshCredentials();
    const refreshedAccessToken = refreshed?.accessToken?.trim();
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshedAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: runtimeModel.model || DEFAULT_CODEX_MODEL,
          instructions: DEFAULT_CODEX_INSTRUCTIONS,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: params.prompt,
                },
              ],
            },
          ],
          stream: true,
          store: false,
        }),
      });
    }
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Codex request failed (${response.status}): ${body}`);
  }

  return readCodexResponseText(response);
}

export function createCodexPlugin(options: CodexPluginOptions): Plugin {
  class CodexService extends ElizaService {
    static serviceType = "codex";

    capabilityDescription =
      "Linked Codex account bridge for ChatGPT-backed Codex workflows, account-aware inference routing, and operator surfaces.";

    static async start(runtime?: IAgentRuntime): Promise<CodexService> {
      return new CodexService(runtime);
    }

    async stop(): Promise<void> {}

    status(): LinkedAccountStatus {
      return options.getStatus();
    }

    runtimeCredentials() {
      const status = options.getStatus();
      return {
        provider: "codex",
        upstreamProvider: "openai-codex",
        available: status.available,
        reusable: status.reusable,
        baseUrl: DEFAULT_CODEX_BASE_URL,
        authMode: status.authMode ?? "chatgpt",
        source: status.source,
        lastRefresh: status.lastRefresh,
        detail: status.detail,
      };
    }

    async refreshRuntimeCredentials() {
      return options.refreshCredentials?.();
    }

    async generateText(params: CodexLiveGenerateParams): Promise<string> {
      return runCodexTextGeneration(this.runtime, params, options);
    }
  }

  return {
    name: "@elizaos/plugin-codex",
    description:
      "Workspace-native Codex plugin for linked-account discovery and Codex-native workflow routing.",
    services: [CodexService],
    models: options.enabled
      ? {
          [ModelType.TEXT_SMALL]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_LARGE]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_SMALL]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_REASONING_LARGE]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
          [ModelType.TEXT_COMPLETION]: (runtime, params) =>
            runCodexTextGeneration(runtime, params, options),
        }
      : undefined,
    providers: [],
    actions: [],
    evaluators: [],
    priority: options.enabled ? 100 : 0,
  };
}
