import type { GenerateTextParams, Memory } from "@elizaos/core";
import type { AppContext } from "@/runtime/bootstrap";

function errorDiagnostic(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const stack =
    error instanceof Error
      ? error.stack
      : typeof error === "string"
        ? error
        : undefined;
  const categories = [
    "image",
    "auth",
    "model handler",
    "bootstrap",
    "messages",
    "prompt",
    "fetch",
    "configuration",
    "provider",
    "unsupported",
  ];
  const cause =
    error instanceof Error && error.cause && typeof error.cause === "object"
      ? (error.cause as { code?: unknown; name?: unknown })
      : undefined;
  return {
    errorKind:
      error instanceof Error
        ? error.name.replace(/[^A-Za-z0-9_-]/gu, "").slice(0, 80)
        : "unknown",
    categories: categories.filter((category) =>
      message.toLowerCase().includes(category),
    ),
    messageLength: message.length,
    frames: (
      stack?.match(/[A-Za-z0-9_.-]+\.[cm]?[jt]sx?:\d+:\d+/gu) ?? []
    ).slice(0, 24),
    ssrfBlocked: message.includes("private/internal IP address"),
    causeCode:
      typeof cause?.code === "string" && /^[A-Z0-9_]{1,64}$/u.test(cause.code)
        ? cause.code
        : null,
  };
}

import { getAppContext } from "@/runtime/bootstrap";
import {
  ensureLocalInteractiveSettingsState,
  ensureTurnConnection,
} from "@/runtime/chat-turn/connection";
import { createTurnState } from "@/runtime/chat-turn/state";
import { runWithTurnRuntimeScope } from "@/runtime/turn-runtime-scope";
import { startApiServer, stopApiServer } from "@/server";
import { shellQuote } from "@/services/terminal/execution/subprocess/shell";

// Test driver: a fresh, isolated real runtime. Only the synthetic fixture is owned.
let context: AppContext | undefined;
let sessionId: string | undefined;
let stopping = false;
let actionRequested = false;
let actionAbort: AbortController | undefined;
const owner = "rendered-browser-acceptance";
async function stop() {
  if (stopping) return;
  stopping = true;
  actionAbort?.abort();
  try {
    if (context && sessionId)
      context.services.terminal.appServers.stop(owner, sessionId);
  } finally {
    await stopApiServer();
    await context?.runtime.stop();
    process.exit(0);
  }
}
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
process.once("disconnect", () => void stop());

try {
  const fetchImplementation = globalThis.fetch;
  const bridgeUrl = process.env.ELIZA_BROWSER_WORKSPACE_URL;
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const providerRequest =
      url === "https://chatgpt.com/backend-api/codex/responses" &&
      init?.method === "POST";
    // Inspect the real outbound body only in memory. Never emit text, images,
    // headers, credentials, account identifiers or an arbitrary configured label.
    let providerEvidence:
      | {
          selectedModelMatches: boolean;
          selectedEffortMatches: boolean;
          imageInputs: number;
        }
      | undefined;
    if (providerRequest && typeof init?.body === "string") {
      try {
        const body = JSON.parse(init.body) as {
          model?: unknown;
          reasoning?: { effort?: unknown };
          input?: Array<{ content?: Array<{ type?: unknown }> }>;
        };
        providerEvidence = {
          selectedModelMatches: body.model === "gpt-6-luna",
          selectedEffortMatches: body.reasoning?.effort === "medium",
          imageInputs: Array.isArray(body.input)
            ? body.input.reduce(
                (total, item) =>
                  total +
                  (Array.isArray(item?.content)
                    ? item.content.filter(
                        (part) => part?.type === "input_image",
                      ).length
                    : 0),
                0,
              )
            : 0,
        };
      } catch {
        // Malformed evidence remains unavailable and fails the parent check.
      }
    }
    let response: Response;
    try {
      response = await fetchImplementation(input, init);
    } catch (error) {
      if (providerRequest)
        process.send?.({
          type: "provider-observation",
          status: null,
          ...providerEvidence,
        });
      if (bridgeUrl && url.startsWith(`${bridgeUrl}/tabs`))
        process.send?.({
          type: "bridge-request",
          operation: "transport-failed",
          ...errorDiagnostic(error),
        });
      throw error;
    }
    if (providerRequest)
      process.send?.({
        type: "provider-observation",
        status: response.status,
        ...providerEvidence,
      });
    if (bridgeUrl && url.startsWith(`${bridgeUrl}/tabs`))
      process.send?.({
        type: "bridge-request",
        operation: url.endsWith("/snapshot")
          ? "snapshot"
          : init?.method === "DELETE"
            ? "close"
            : init?.method === "POST"
              ? "open"
              : "state",
        status: response.status,
      });
    return response;
  };
  context = await getAppContext({ startupMode: "api" });
  const capture = context.services.web.capture.bind(context.services.web);
  context.services.web.capture = async (...args) => {
    process.send?.({ type: "capture-observation", phase: "started" });
    try {
      const result = await capture(...args);
      process.send?.({
        type: "capture-observation",
        phase: "completed",
        rendered: result.captureMode === "rendered-page",
      });
      return result;
    } catch (error) {
      process.send?.({
        type: "capture-observation",
        phase: "failed",
        ...errorDiagnostic(error),
      });
      throw error;
    }
  };
  const logError = context.services.logger.error.bind(context.services.logger);
  context.services.logger.error = (...args) => {
    if (args[0] === "api-request-failed")
      process.send?.({
        type: "analysis-failure",
        ...errorDiagnostic(args[1]?.detail),
      });
    logError(...args);
  };
  const useModel = context.runtime.useModel.bind(context.runtime);
  context.runtime.useModel = (async (...args: Parameters<typeof useModel>) => {
    const [, params] = args;
    const inputs = params as GenerateTextParams | undefined;
    const imageInputs =
      inputs?.messages?.flatMap((message) =>
        Array.isArray(message.content)
          ? message.content.filter((part) => part.type === "image")
          : [],
      ).length ?? 0;
    try {
      const result = await useModel(...args);
      process.send?.({
        type: "model-observation",
        imageInputs,
        resultType: typeof result,
      });
      return result;
    } catch (error) {
      process.send?.({
        type: "model-observation",
        imageInputs,
        ...errorDiagnostic(error),
      });
      throw error;
    }
  }) as typeof context.runtime.useModel;
  const complete = context.services.web.completeAnalysis.bind(
    context.services.web,
  );
  context.services.web.completeAnalysis = async (...args) => {
    try {
      return await complete(...args);
    } catch (error) {
      process.send?.({ type: "analysis-failure", ...errorDiagnostic(error) });
      throw error;
    }
  };
  const fixture = process.argv[2];
  if (!fixture) throw new Error("Synthetic fixture path is required.");
  const started = await context.services.terminal.startManagedApplication({
    owner,
    cwd: context.config.workspaceDir,
    command: `node ${shellQuote(fixture)}`,
    waitMs: 10_000,
  });
  sessionId = started.session.id;
  if (started.status !== "ready" || !started.url)
    throw new Error("Synthetic managed app did not become ready.");
  const appUrl = started.url;
  const api = await startApiServer(context);
  // Test-only IPC: invoke the actual registered action with the same owner
  // connection bootstrap as a desktop turn. No provider, service, permission
  // or action replacement is installed. Emit only bounded diagnostic facts.
  const active = context;
  process.on("message", (request) => {
    if (
      !request ||
      typeof request !== "object" ||
      !("type" in request) ||
      request.type !== "agent-analysis" ||
      actionRequested ||
      stopping
    )
      return;
    actionRequested = true;
    actionAbort = new AbortController();
    void (async () => {
      try {
        const turn = createTurnState(
          {
            userId: owner,
            roomId: owner,
            source: "desktop",
            message: "Review the synthetic managed app.",
          },
          active,
        );
        await ensureTurnConnection(active, {
          entityId: turn.entityId,
          roomId: turn.roomId,
          worldId: turn.worldId,
          source: turn.connectionSource,
          channelId: turn.sessionId,
          messageServerId: turn.messageServerId,
        });
        await ensureLocalInteractiveSettingsState(active, turn);
        const memory = {
          id: turn.messageId,
          entityId: turn.entityId,
          agentId: active.runtime.agentId,
          roomId: turn.roomId,
          content: {
            text: "Review the synthetic managed app.",
            source: "desktop",
          },
        } as Memory;
        const actions = active.runtime.getAllActions();
        const action = actions.find(
          (candidate) => candidate.name === "DOOLITTLE_BROWSER_ANALYZE",
        );
        const coding = actions.find(
          (candidate) => candidate.name === "DOOLITTLE_CODING",
        );
        if (!action || !(await action.validate(active.runtime, memory)))
          throw new Error("Registered page-review action unavailable.");
        const result = await runWithTurnRuntimeScope(
          active.runtime,
          {
            settings: new Map(),
            abortSignal: actionAbort?.signal,
            settledActionResults: [],
          },
          () =>
            action.handler(active.runtime, memory, undefined, {
              parameters: { url: appUrl },
            }),
        );
        const data = result?.data as
          | {
              modelEvidence?: unknown;
              evidence?: Array<{ viewport?: { width?: unknown } }>;
            }
          | undefined;
        const critique = result?.text ?? "";
        process.send?.({
          type: "agent-analysis-result",
          actionRegistered: true,
          codingChildRegistered:
            coding?.subActions?.includes(action.name) === true,
          success: result?.success === true,
          continueChain: result?.continueChain === true,
          noCompletionClaim: result?.verifiedUserFacing !== true,
          boundedOutput: critique.length > 0 && critique.length < 11_000,
          modelEvidence:
            data?.modelEvidence === "rendered-pixels"
              ? "rendered-pixels"
              : "text-only",
          desktopWidth: data?.evidence?.[0]?.viewport?.width,
          narrowWidth: data?.evidence?.[1]?.viewport?.width,
          contrastDefectIdentified:
            /contrast|unreadable|invisible|illegible|same.{0,15}colou?r|black.on.black/iu.test(
              critique,
            ),
          semanticLinkDefectIdentified:
            /story|newsletter|link.{0,40}target/iu.test(critique),
          rawCaptureFieldsAbsent:
            !/"(?:prompt|page|facts|snapshotPath|screenshotPath|manifestPath|reportPath)"\s*:/u.test(
              JSON.stringify(data),
            ),
        });
      } catch {
        process.send?.({ type: "agent-analysis-failed" });
      }
    })();
  });
  process.send?.({ type: "runtime-ready", url: api.url, appUrl: started.url });
} catch {
  process.send?.({ type: "runtime-failed" });
  await stop();
}
