import { setTimeout as delay } from "node:timers/promises";
import {
  defaultAuthPath,
  loadCodexAuth,
  refreshCodexAuth,
  toOpenAITools,
} from "@elizaos/plugin-codex-cli";
import type {
  CodexBackendConfig,
  CodexGenerateParams,
  CodexGenerateResult,
} from "@elizaos/plugin-codex-cli/src/codex-backend";
import OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsStreaming,
} from "openai/resources/responses/responses";
import { codexMessageText, codexResponsesInput } from "./codex-responses-input";

export class CodexResponsesBackend {
  private tail: Promise<void> = Promise.resolve();
  constructor(
    private readonly options: CodexBackendConfig & {
      reasoningEffort?: () => string | undefined;
    } = {},
  ) {
    this.options = { ...options };
    let url: URL;
    try {
      url = new URL(options.baseUrl ?? "https://chatgpt.com/backend-api/codex");
    } catch {
      throw new Error("Invalid Codex base URL.");
    }
    const allowed =
      (url.hostname === "chatgpt.com" && url.protocol === "https:") ||
      (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
        ["http:", "https:"].includes(url.protocol));
    if (!allowed || url.username || url.password || url.search || url.hash)
      throw new Error(
        "Codex base URL must target ChatGPT or a local test server.",
      );
  }
  generate(params: CodexGenerateParams): Promise<CodexGenerateResult> {
    const result = this.tail.then(() => this.generateInner(params));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
  private async generateInner(
    params: CodexGenerateParams,
  ): Promise<CodexGenerateResult> {
    params.abortSignal?.throwIfAborted();
    const jitter = this.options.jitterMaxMs ?? 200;
    if (jitter > 0)
      await delay(Math.random() * jitter, undefined, {
        signal: params.abortSignal,
      });
    const input = await codexResponsesInput(params.messages, params.prompt);
    const system =
      params.system ??
      params.messages
        ?.filter(
          (message) =>
            message.role === "system" || message.role === "developer",
        )
        .map((message) => codexMessageText(message.content))
        .filter(Boolean)
        .join("\n\n") ??
      "";
    const effort = this.options.reasoningEffort?.();
    const format =
      typeof params.responseFormat === "object"
        ? params.responseFormat
        : { type: params.responseFormat };
    const toolChoice = params.toolChoice;
    const body: ResponseCreateParamsStreaming = {
      model: params.model ?? this.options.model ?? "gpt-6-luna",
      instructions: system,
      input,
      store: false,
      stream: true,
      ...(params.tools?.length
        ? {
            tools: toOpenAITools(
              params.tools,
            ) as ResponseCreateParamsStreaming["tools"],
          }
        : {}),
      ...(toolChoice
        ? {
            tool_choice:
              typeof toolChoice === "string"
                ? toolChoice
                : {
                    type: "function",
                    name:
                      "name" in toolChoice
                        ? toolChoice.name
                        : toolChoice.function.name,
                  },
          }
        : {}),
      ...(effort
        ? {
            reasoning: {
              effort: effort as NonNullable<
                ResponseCreateParamsStreaming["reasoning"]
              >["effort"],
            },
          }
        : {}),
      ...(format.type === "json_object"
        ? { text: { format: { type: "json_object" } } }
        : format.type === "json_schema" && "schema" in format
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: "response",
                  schema: format.schema,
                },
              },
            }
          : {}),
    };
    const path = this.options.authPath ?? defaultAuthPath();
    let auth = await (this.options.loadAuth ?? loadCodexAuth)(path);
    for (let attempt = 0; attempt < 2; attempt++) {
      const client = new OpenAI({
        apiKey: auth.tokens.access_token,
        baseURL:
          this.options.baseUrl ?? "https://chatgpt.com/backend-api/codex",
        organization: null,
        project: null,
        maxRetries: 0,
        logLevel: "off",
        fetch: this.options.fetchImpl,
        fetchOptions: { redirect: "error" },
        defaultHeaders: {
          "chatgpt-account-id": auth.tokens.account_id,
          originator: this.options.originator ?? "codex_cli_rs",
          "User-Agent": this.options.userAgent ?? "doolittle",
          "OpenAI-Beta": "responses=v1",
        },
      });
      try {
        const stream = await client.responses.create(body, {
          signal: params.abortSignal,
        });
        let completed: Response | undefined;
        for await (const event of stream) {
          if (event.type === "response.output_text.delta")
            params.onTextDelta?.(event.delta);
          if (event.type === "response.completed") completed = event.response;
          if (
            event.type === "error" ||
            event.type === "response.failed" ||
            event.type === "response.incomplete"
          )
            throw new Error("Codex response did not complete.");
        }
        if (!completed)
          throw new Error("Codex stream ended before completion.");
        const toolCalls = completed.output.flatMap((item) =>
          item.type === "function_call"
            ? [{ id: item.call_id, name: item.name, arguments: item.arguments }]
            : [],
        );
        return {
          text: completed.output
            .flatMap((item) =>
              item.type === "message"
                ? item.content.flatMap((part) =>
                    part.type === "output_text" ? [part.text] : [],
                  )
                : [],
            )
            .join(""),
          toolCalls,
          finishReason: toolCalls.length ? "tool_calls" : "stop",
          ...(completed.usage
            ? {
                usage: {
                  inputTokens: completed.usage.input_tokens,
                  outputTokens: completed.usage.output_tokens,
                  totalTokens: completed.usage.total_tokens,
                },
              }
            : {}),
        };
      } catch (error) {
        if (params.abortSignal?.aborted)
          throw new DOMException("Codex request aborted.", "AbortError");
        if (error instanceof OpenAI.APIError) {
          if (error.status === 401 && attempt === 0) {
            try {
              auth = await (this.options.refreshAuth ?? refreshCodexAuth)(
                auth,
                path,
              );
            } catch {
              throw new Error("Codex authentication refresh failed.");
            }
            continue;
          }
          // Provider response bodies can contain echoed prompts/images. Keep
          // diagnostics bounded to status and never expose SDK request objects.
          throw new Error(
            `Codex request failed (HTTP ${error.status ?? "unavailable"}).`,
          );
        }
        throw new Error("Codex response stream did not complete.");
      }
    }
    throw new Error("Codex authentication could not be refreshed.");
  }
}
