import { getRuntimeModelSettings } from "@doolittle/provider-transport";
import type { GenerateTextParams, IAgentRuntime, Plugin } from "@elizaos/core";
import {
  __INTERNAL_buildCodexGenerateParams,
  type CodexAuth,
  CodexBackend,
} from "@elizaos/plugin-codex-cli";

export const CODEX_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type CodexReasoningEffort = (typeof CODEX_REASONING_EFFORTS)[number];

type CodexModelHandler = (
  runtime: IAgentRuntime,
  params: GenerateTextParams,
) => Promise<unknown>;

type CodexBackendOptions = {
  authPath?: string;
  model?: string;
  baseUrl?: string;
  userAgent?: string;
  originator?: string;
  jitterMaxMs?: number;
  fetchImpl?: typeof fetch;
  loadAuth?: (path: string) => Promise<CodexAuth>;
  refreshAuth?: (currentAuth: CodexAuth, path: string) => Promise<CodexAuth>;
};

type CodexGenerateResult = {
  text: string;
  toolCalls: unknown[];
  finishReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
};

type CodexBackendFactory = (runtime: IAgentRuntime) => CodexBackend;

function selectedCodexReasoningEffort(
  runtime: IAgentRuntime,
): CodexReasoningEffort | undefined {
  const settings = getRuntimeModelSettings(runtime);
  const effort = settings.reasoningEffort?.trim();
  return settings.provider === "codex" &&
    CODEX_REASONING_EFFORTS.includes(effort as CodexReasoningEffort)
    ? (effort as CodexReasoningEffort)
    : undefined;
}

function withCodexReasoningBody(
  body: BodyInit | null | undefined,
  effort: CodexReasoningEffort | undefined,
): BodyInit | null | undefined {
  if (!effort || typeof body !== "string") return body;
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return body;
    }
    return JSON.stringify({
      ...parsed,
      reasoning: { effort },
    });
  } catch {
    return body;
  }
}

function requestAbortSignal(
  params: GenerateTextParams,
): AbortSignal | undefined {
  // `signal` is Eliza's public model contract. Keep accepting the pinned
  // Codex plugin's older alias for callers that use it directly.
  return (
    params.signal ??
    (params as GenerateTextParams & { abortSignal?: AbortSignal }).abortSignal
  );
}

function getCodexRuntimeSetting(
  runtime: IAgentRuntime,
  key:
    | "CODEX_AUTH_PATH"
    | "CODEX_BASE_URL"
    | "CODEX_MODEL"
    | "CODEX_ORIGINATOR"
    | "CODEX_JITTER_MS_MAX",
): string | undefined {
  const value = runtime.getSetting?.(key);
  return value === undefined || value === null
    ? process.env[key]
    : String(value);
}

/**
 * Adds the Doolittle route's selected effort at the narrow outbound seam the
 * pinned Codex plugin does not yet expose. The official backend continues to
 * own OAuth, refresh, request serialization, SSE parsing, and tool handling.
 */
export function createCodexReasoningFetch(
  runtime: IAgentRuntime,
  fetchImplementation: typeof fetch = fetch,
): typeof fetch {
  return (input, init) => {
    const effort = selectedCodexReasoningEffort(runtime);
    return fetchImplementation(input, {
      ...init,
      body: withCodexReasoningBody(init?.body, effort),
    });
  };
}

export function createCodexReasoningBackend(
  runtime: IAgentRuntime,
  config: CodexBackendOptions = {},
): CodexBackend {
  // Mirror the pinned plugin's createBackend(runtime) settings so the
  // reasoning-compatible backend remains a drop-in replacement for it.
  const jitterRaw = getCodexRuntimeSetting(runtime, "CODEX_JITTER_MS_MAX");
  const runtimeJitterMaxMs =
    jitterRaw === undefined ? undefined : Number.parseInt(jitterRaw, 10);
  return new CodexBackend({
    authPath:
      config.authPath ?? getCodexRuntimeSetting(runtime, "CODEX_AUTH_PATH"),
    baseUrl:
      config.baseUrl ?? getCodexRuntimeSetting(runtime, "CODEX_BASE_URL"),
    model:
      config.model ??
      getCodexRuntimeSetting(runtime, "CODEX_MODEL") ??
      "gpt-5.5",
    userAgent: config.userAgent,
    originator:
      config.originator ?? getCodexRuntimeSetting(runtime, "CODEX_ORIGINATOR"),
    jitterMaxMs:
      config.jitterMaxMs ??
      (Number.isFinite(runtimeJitterMaxMs) ? runtimeJitterMaxMs : undefined),
    fetchImpl: createCodexReasoningFetch(runtime, config.fetchImpl),
    loadAuth: config.loadAuth,
    refreshAuth: config.refreshAuth,
  });
}

function toCodexTextReturn(
  params: GenerateTextParams,
  result: CodexGenerateResult,
): unknown {
  if (
    params.tools?.length ||
    params.messages?.length ||
    result.toolCalls.length
  ) {
    return {
      text: result.text,
      toolCalls: result.toolCalls,
      finishReason: result.finishReason,
      usage: result.usage,
    };
  }
  return result.text;
}

function createReasoningModelHandler(
  fallback: CodexModelHandler,
  createBackend: CodexBackendFactory = createCodexReasoningBackend,
): CodexModelHandler {
  const backends = new WeakMap<IAgentRuntime, CodexBackend>();
  const backendFor = (runtime: IAgentRuntime) => {
    let backend = backends.get(runtime);
    if (!backend) {
      backend = createBackend(runtime);
      backends.set(runtime, backend);
    }
    return backend;
  };

  return async (runtime, params) => {
    if (!selectedCodexReasoningEffort(runtime))
      return fallback(runtime, params);
    const request = __INTERNAL_buildCodexGenerateParams(runtime, params);
    const abortSignal = requestAbortSignal(params);
    if (params.stream) {
      const chunks: string[] = [];
      let notify: (() => void) | undefined;
      let complete = false;
      const wake = () => {
        notify?.();
        notify = undefined;
      };
      const result = backendFor(runtime)
        .generate({
          ...request,
          abortSignal,
          onTextDelta: (chunk) => {
            chunks.push(chunk);
            wake();
          },
        })
        .finally(() => {
          complete = true;
          wake();
        });
      const textStream = async function* () {
        while (!complete || chunks.length > 0) {
          const chunk = chunks.shift();
          if (chunk !== undefined) {
            yield chunk;
            continue;
          }
          await new Promise<void>((resolve) => {
            notify = resolve;
          });
        }
      };
      const withTools = Boolean(
        params.messages?.length || params.tools?.length || params.toolChoice,
      );
      return {
        textStream: textStream(),
        text: result.then((value) => value.text),
        ...(withTools
          ? { toolCalls: result.then((value) => value.toolCalls) }
          : {}),
        usage: result.then((value) =>
          value.usage
            ? {
                promptTokens: value.usage.inputTokens,
                completionTokens: value.usage.outputTokens,
                totalTokens: value.usage.totalTokens,
              }
            : undefined,
        ),
        finishReason: result.then((value) => value.finishReason),
        providerMetadata: { modelName: request.model },
      };
    }
    const result = await backendFor(runtime).generate({
      ...request,
      abortSignal,
    });
    return toCodexTextReturn(params, result);
  };
}

/** Wrap the official plugin only for selected Codex reasoning levels. */
export function createDoolittleCodexReasoningPlugin(
  plugin: Plugin,
  dependencies: { createBackend?: CodexBackendFactory } = {},
): Plugin {
  return {
    ...plugin,
    models: Object.fromEntries(
      Object.entries(plugin.models ?? {}).map(([modelType, handler]) => [
        modelType,
        createReasoningModelHandler(
          handler as CodexModelHandler,
          dependencies.createBackend,
        ),
      ]),
    ) as Plugin["models"],
  };
}
