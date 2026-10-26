import { performance } from "node:perf_hooks";
import { DEFAULT_MODEL_ROUTE } from "@doolittle/contracts";
import { getRuntimeModelSettings } from "@doolittle/provider-transport";
import type { GenerateTextParams, IAgentRuntime, Plugin } from "@elizaos/core";
import type { CodexAuth, CodexBackend } from "@elizaos/plugin-codex-cli";
import type { CodexGenerateParams } from "@elizaos/plugin-codex-cli/src/codex-backend";
import { CodexResponsesBackend } from "./codex-responses-backend";
import type { CodexModelCallMetric } from "./eval-model-metrics";

export const CODEX_REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
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

type CodexBackendFactory = (
  runtime: IAgentRuntime,
) => Pick<CodexBackend, "generate">;
type CodexModelCallObserver = (metric: CodexModelCallMetric) => void;
type CodexModelObservationContext = (
  runtime: IAgentRuntime,
  params: GenerateTextParams,
  metric: CodexModelCallMetric,
) => void;

function modelCallMetric(
  completed: boolean,
  startedAt: number,
  firstTextAt: number | null,
  result?: CodexGenerateResult,
): CodexModelCallMetric {
  const usage = result?.usage;
  return {
    provider: "codex",
    completed,
    providerDurationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    firstTextMs:
      firstTextAt === null
        ? null
        : Math.max(0, Math.round(firstTextAt - startedAt)),
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  };
}

function observeModelCall(
  observer: CodexModelCallObserver | undefined,
  metric: CodexModelCallMetric,
  contextObserver: CodexModelObservationContext | undefined,
  runtime: IAgentRuntime,
  params: GenerateTextParams,
): void {
  try {
    observer?.(metric);
  } catch {
    // Observability must not affect the model result or stream lifecycle.
  }
  try {
    contextObserver?.(runtime, params, metric);
  } catch {
    // Independent optional observation must not affect usage or model behavior.
  }
}

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

function requestAbortSignal(
  params: GenerateTextParams,
): AbortSignal | undefined {
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

/** Preserve SDK account/route settings while the official Responses client owns HTTP. */
export function createCodexReasoningBackend(
  runtime: IAgentRuntime,
  config: CodexBackendOptions = {},
): Pick<CodexBackend, "generate"> {
  // Reuse SDK account paths and the client's selected model/effort settings.
  const jitterRaw = getCodexRuntimeSetting(runtime, "CODEX_JITTER_MS_MAX");
  const runtimeJitterMaxMs =
    jitterRaw === undefined ? undefined : Number.parseInt(jitterRaw, 10);
  return new CodexResponsesBackend({
    authPath:
      config.authPath ?? getCodexRuntimeSetting(runtime, "CODEX_AUTH_PATH"),
    baseUrl:
      config.baseUrl ?? getCodexRuntimeSetting(runtime, "CODEX_BASE_URL"),
    model:
      config.model ??
      getCodexRuntimeSetting(runtime, "CODEX_MODEL") ??
      DEFAULT_MODEL_ROUTE.model,
    userAgent: config.userAgent,
    originator:
      config.originator ?? getCodexRuntimeSetting(runtime, "CODEX_ORIGINATOR"),
    jitterMaxMs:
      config.jitterMaxMs ??
      (Number.isFinite(runtimeJitterMaxMs) ? runtimeJitterMaxMs : undefined),
    fetchImpl: config.fetchImpl,
    reasoningEffort: () => selectedCodexReasoningEffort(runtime),
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

function observePromiseRejection<T>(promise: Promise<T>): Promise<T> {
  // The SDK does not always consume every optional promise in a streamed
  // result. Observe rejection without changing the promise returned to callers.
  void promise.catch(() => undefined);
  return promise;
}

function createReasoningModelHandler(
  createBackend: CodexBackendFactory = createCodexReasoningBackend,
  observeUsage?: CodexModelCallObserver,
  observeContext?: CodexModelObservationContext,
): CodexModelHandler {
  const backends = new WeakMap<IAgentRuntime, Pick<CodexBackend, "generate">>();
  const backendFor = (runtime: IAgentRuntime) => {
    let backend = backends.get(runtime);
    if (!backend) {
      backend = createBackend(runtime);
      backends.set(runtime, backend);
    }
    return backend;
  };

  return async (runtime, params) => {
    const requestedModel = (params as GenerateTextParams & { model?: string })
      .model;
    const request: CodexGenerateParams = {
      ...params,
      prompt: params.prompt ?? "",
      model:
        requestedModel?.trim() ||
        getCodexRuntimeSetting(runtime, "CODEX_MODEL") ||
        DEFAULT_MODEL_ROUTE.model,
      responseFormat:
        params.responseFormat ??
        (params.responseSchema
          ? { type: "json_schema", schema: params.responseSchema }
          : undefined),
    };
    const abortSignal = requestAbortSignal(params);
    if (params.stream) {
      const startedAt = performance.now();
      const chunks: string[] = [];
      let firstTextAt: number | null = null;
      let notify: (() => void) | undefined;
      let complete = false;
      let streamError: unknown;
      let failed = false;
      const wake = () => {
        notify?.();
        notify = undefined;
      };
      const result = backendFor(runtime).generate({
        ...request,
        abortSignal,
        onTextDelta: (chunk) => {
          firstTextAt ??= performance.now();
          chunks.push(chunk);
          wake();
        },
      });
      // Do not use an ignored `.finally()`: its returned promise rejects too,
      // and expected aborts can otherwise become process-level unhandled
      // rejections that terminate the desktop runtime.
      void result.then(
        (value) => {
          observeModelCall(
            observeUsage,
            modelCallMetric(true, startedAt, firstTextAt, value),
            observeContext,
            runtime,
            params,
          );
          complete = true;
          wake();
        },
        (error: unknown) => {
          observeModelCall(
            observeUsage,
            modelCallMetric(false, startedAt, firstTextAt),
            observeContext,
            runtime,
            params,
          );
          streamError = error;
          failed = true;
          complete = true;
          wake();
        },
      );
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
        if (failed) throw streamError;
      };
      const withTools = Boolean(
        params.messages?.length || params.tools?.length || params.toolChoice,
      );
      return {
        textStream: textStream(),
        text: observePromiseRejection(result.then((value) => value.text)),
        ...(withTools
          ? {
              toolCalls: observePromiseRejection(
                result.then((value) => value.toolCalls),
              ),
            }
          : {}),
        usage: observePromiseRejection(
          result.then((value) =>
            value.usage
              ? {
                  promptTokens: value.usage.inputTokens,
                  completionTokens: value.usage.outputTokens,
                  totalTokens: value.usage.totalTokens,
                }
              : undefined,
          ),
        ),
        finishReason: observePromiseRejection(
          result.then((value) => value.finishReason),
        ),
        providerMetadata: { modelName: request.model },
      };
    }
    const startedAt = performance.now();
    let firstTextAt: number | null = null;
    try {
      const result = await backendFor(runtime).generate({
        ...request,
        abortSignal,
        onTextDelta: (chunk) => {
          firstTextAt ??= performance.now();
          request.onTextDelta?.(chunk);
        },
      });
      observeModelCall(
        observeUsage,
        modelCallMetric(true, startedAt, firstTextAt, result),
        observeContext,
        runtime,
        params,
      );
      return toCodexTextReturn(params, result);
    } catch (error) {
      observeModelCall(
        observeUsage,
        modelCallMetric(false, startedAt, firstTextAt),
        observeContext,
        runtime,
        params,
      );
      throw error;
    }
  };
}

/** Keep ElizaOS model registration/auth while the current Responses SDK owns transport. */
export function createDoolittleCodexReasoningPlugin(
  plugin: Plugin,
  dependencies: {
    createBackend?: CodexBackendFactory;
    observeUsage?: CodexModelCallObserver;
    observeContext?: CodexModelObservationContext;
  } = {},
): Plugin {
  return {
    ...plugin,
    models: Object.fromEntries(
      Object.keys(plugin.models ?? {}).map((modelType) => [
        modelType,
        createReasoningModelHandler(
          dependencies.createBackend,
          dependencies.observeUsage,
          dependencies.observeContext,
        ),
      ]),
    ) as Plugin["models"],
  };
}
