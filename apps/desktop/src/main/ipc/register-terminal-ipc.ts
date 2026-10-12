import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  DesktopCommandRequest,
  DesktopCommandResult,
  InteractiveTerminalInputRequest,
  InteractiveTerminalOutputResult,
  InteractiveTerminalResizeRequest,
  InteractiveTerminalSession,
  InteractiveTerminalStartRequest,
  InteractiveTerminalStartResult,
  TerminalStreamRequest,
} from "../../shared/contracts";
import {
  type DesktopIpcInvokeChannel,
  desktopIpcChannels,
} from "../../shared/ipc-channels";
import { SseParser } from "../../shared/sse";
import type { BackendManager } from "../backend";
import type { BotProcessRegistry } from "../bot-process-registry";
import { isRecord } from "./input-validation";
import type {
  DesktopBackgroundNotification,
  SensitiveActionConfirmationRequest,
} from "./ipc-validation";
import {
  validateDesktopCommandRequest,
  validateInteractiveTerminalInputRequest,
  validateInteractiveTerminalOutput,
  validateInteractiveTerminalResizeRequest,
  validateInteractiveTerminalSession,
  validateInteractiveTerminalSessionId,
  validateInteractiveTerminalStartRequest,
  validateTerminalBotId,
  validateTerminalRequestId,
  validateTerminalStreamRequest,
} from "./ipc-validation";
import { parseRequestError, parseSuccessfulJson } from "./runtime-http";

const API_TIMEOUT_MS = 15_000;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;
const START_POST_BOOTSTRAP_BUDGET_MS = 20_000;
const CREATION_ATTEMPT_RETENTION_MS = 10 * 60_000;
const MAX_CREATION_ATTEMPTS = 256;

class TerminalRuntimeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    readonly runtimeInstanceId: string | undefined,
  ) {
    super("Interactive terminal request failed.");
  }
}

class TerminalStartAuthorizationError extends Error {}

function temporarySocketFailure(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 4 && candidate instanceof Error; depth += 1) {
    const code = (candidate as Error & { code?: unknown }).code;
    if (
      code === "ECONNRESET" ||
      code === "EPIPE" ||
      code === "UND_ERR_SOCKET"
    ) {
      return true;
    }
    candidate = (candidate as Error & { cause?: unknown }).cause;
  }
  return false;
}

function retryableIdentityReadFailure(
  error: unknown,
  signal: AbortSignal,
): boolean {
  return (
    (error instanceof Error && error.name === "TimeoutError") ||
    (error instanceof Error &&
      error.name === "AbortError" &&
      signal.aborted &&
      signal.reason instanceof Error &&
      signal.reason.name === "TimeoutError") ||
    temporarySocketFailure(error)
  );
}

interface ActiveTerminalRun {
  controller: AbortController;
}

type RegisterHandler = (
  channel: DesktopIpcInvokeChannel,
  handler: Parameters<IpcMain["handle"]>[1],
) => void;

export interface TerminalIpcRegistrationContext {
  backend: BackendManager;
  bots?: BotProcessRegistry;
  registerHandler: RegisterHandler;
  activeTerminalRuns: Map<string, ActiveTerminalRun>;
  confirmSensitiveAction: (
    request: SensitiveActionConfirmationRequest,
  ) => Promise<boolean>;
  sensitiveFetch: typeof fetch;
  notifyBackground: (notification: DesktopBackgroundNotification) => void;
  trackSenderCleanup: (
    sender: IpcMainInvokeEvent["sender"],
    cleanup: () => void,
  ) => () => void;
}

function terminalKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
}

export function registerTerminalIpcHandlers(
  context: TerminalIpcRegistrationContext,
): void {
  const {
    backend,
    bots,
    registerHandler,
    activeTerminalRuns,
    confirmSensitiveAction,
    sensitiveFetch,
    notifyBackground,
    trackSenderCleanup,
  } = context;
  const { event: eventChannels, invoke: invokeChannels } = desktopIpcChannels;
  const terminalOwners = new Map<
    string,
    {
      botId: string;
      originConversationId: string;
      workspacePath: string;
      backend: BackendManager;
      url: string;
      processId: number;
      runtimeInstanceId: string;
    }
  >();
  const creationAttempts = new Map<
    string,
    {
      createdAt: number;
      request: InteractiveTerminalStartRequest;
      creationId: string;
      backend?: BackendManager;
      url?: string;
      processId?: number;
      runtimeInstanceId?: string;
      pending?: Promise<InteractiveTerminalStartResult>;
    }
  >();

  const interactiveBackendFor = async (
    botId: string,
    allowActivation = false,
  ): Promise<BackendManager> => {
    if (!bots) {
      if (botId !== "default") throw new Error("Named bots are unavailable.");
      if (backend.getState().phase !== "ready")
        throw new Error("The local runtime is not ready.");
      return backend;
    }
    const bot = bots.get(botId);
    if (!bot.isDefault && !bot.permissions.allowMutation) {
      throw new Error("This bot cannot open a mutable terminal.");
    }
    const target = allowActivation
      ? await bots.backendFor(botId)
      : bots.readyBackendFor(botId);
    if (!target) throw new Error("The named bot is not running.");
    return target;
  };

  const assertTerminalOwner = (sessionId: string, botId: string): void => {
    const owner = terminalOwners.get(sessionId);
    let requestedId: string | undefined;
    try {
      const bot = bots?.get(botId);
      if (bot && !bot.isDefault && !bot.permissions.allowMutation) {
        throw new Error("This bot cannot open a mutable terminal.");
      }
      requestedId = bot?.id;
    } catch {
      /* unknown bot */
    }
    if (!bots || !owner || owner.botId !== requestedId) {
      throw new Error(
        "Interactive terminal belongs to another bot or is unavailable.",
      );
    }
    bots.assertConversationOwner(botId, owner.originConversationId);
    if (
      bots.assertAcpWorkspace(botId, owner.workspacePath) !==
      owner.workspacePath
    ) {
      throw new Error("Interactive terminal workspace has changed.");
    }
  };

  const requestInteractiveTerminal = async (
    botId: string,
    path:
      | "/terminal/session/start"
      | "/terminal/session/input"
      | "/terminal/session/resize"
      | "/terminal/session/interrupt"
      | "/terminal/session/close"
      | `/terminal/session/output?${string}`,
    method: "GET" | "POST",
    body?: object,
    timeoutMs = API_TIMEOUT_MS,
    expected?: { backend: BackendManager; url: string },
    beforeFetch?: () => void,
  ): Promise<unknown> => {
    const target = await interactiveBackendFor(botId);
    const state = target.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }
    if (
      expected &&
      (target !== expected.backend || state.url !== expected.url)
    ) {
      throw new Error("The local runtime changed during terminal creation.");
    }
    if (method === "POST" && path !== "/terminal/session/start") {
      const sessionId = isRecord(body) ? body.sessionId : undefined;
      if (typeof sessionId !== "string") {
        throw new Error("Interactive terminal session is required.");
      }
      assertTerminalOwner(sessionId, botId);
    }
    beforeFetch?.();
    const response = await sensitiveFetch(`${state.url}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      let code: string | undefined;
      let runtimeInstanceId: string | undefined;
      try {
        const errorPayload = await parseSuccessfulJson(response, 4_096);
        if (isRecord(errorPayload)) {
          if (typeof errorPayload.code === "string") code = errorPayload.code;
          if (typeof errorPayload.runtimeInstanceId === "string") {
            runtimeInstanceId = errorPayload.runtimeInstanceId;
          }
        }
      } catch {
        // Invalid or oversized error bodies never become absence receipts.
      }
      throw new TerminalRuntimeHttpError(
        response.status,
        code,
        runtimeInstanceId,
      );
    }
    return parseSuccessfulJson(response, MAX_SENSITIVE_RESPONSE_BYTES);
  };

  const runtimeIdentity = async (
    url: string,
    timeoutMs = 5_000,
    stillReady?: () => boolean,
  ): Promise<{ processId: number; runtimeInstanceId: string }> => {
    const deadline = Date.now() + Math.max(0, Math.min(20_000, timeoutMs));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (stillReady && !stillReady()) {
        throw new Error("The local runtime changed during identity recovery.");
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error("The local runtime identity read timed out.");
      }
      const signal = AbortSignal.timeout(Math.min(5_000, remaining));
      try {
        const response = await sensitiveFetch(`${url}/runtime/bot-identity`, {
          method: "GET",
          signal,
        });
        if (stillReady && !stillReady()) {
          throw new Error(
            "The local runtime changed during identity recovery.",
          );
        }
        if (!response.ok)
          throw new Error("The local runtime identity is unavailable.");
        const payload = await parseSuccessfulJson(
          response,
          MAX_SENSITIVE_RESPONSE_BYTES,
        );
        if (
          !isRecord(payload) ||
          !Number.isSafeInteger(payload.processId) ||
          typeof payload.runtimeInstanceId !== "string" ||
          !/^[a-f0-9-]{36}$/u.test(payload.runtimeInstanceId)
        ) {
          throw new Error("The local runtime identity is invalid.");
        }
        if (stillReady && !stillReady()) {
          throw new Error(
            "The local runtime changed during identity recovery.",
          );
        }
        return {
          processId: payload.processId as number,
          runtimeInstanceId: payload.runtimeInstanceId,
        };
      } catch (error) {
        if (
          attempt === 2 ||
          !retryableIdentityReadFailure(error, signal) ||
          deadline - Date.now() <= 0
        )
          throw error;
        if (stillReady && !stillReady()) {
          throw new Error(
            "The local runtime changed during identity recovery.",
          );
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, Math.min(100, deadline - Date.now())),
        );
      }
    }
    throw new Error("The local runtime identity is unavailable.");
  };

  const matchesTerminalRuntime = async (
    sessionId: string,
    botId: string,
  ): Promise<boolean> => {
    assertTerminalOwner(sessionId, botId);
    const owner = terminalOwners.get(sessionId);
    if (!owner) return false;
    let identity: { processId: number; runtimeInstanceId: string };
    try {
      const target = await interactiveBackendFor(botId);
      const state = target.getState();
      if (
        target !== owner.backend ||
        state.phase !== "ready" ||
        state.url !== owner.url
      )
        return false;
      identity = await runtimeIdentity(owner.url);
    } catch {
      return false;
    }
    // The identity GET yields. A grant can be revoked before its response
    // arrives, so the pre-read owner check cannot authorize a mutation.
    assertTerminalOwner(sessionId, botId);
    const current = bots?.readyBackendFor(botId);
    const state = current?.getState();
    return (
      current === owner.backend &&
      state?.phase === "ready" &&
      state.url === owner.url &&
      identity.processId === owner.processId &&
      identity.runtimeInstanceId === owner.runtimeInstanceId
    );
  };

  const matchesTerminalBackend = (
    sessionId: string,
    botId: string,
  ): boolean => {
    assertTerminalOwner(sessionId, botId);
    const owner = terminalOwners.get(sessionId);
    if (!owner) return false;
    try {
      const target = bots?.readyBackendFor(botId);
      const state = target?.getState();
      return (
        target === owner.backend &&
        state?.phase === "ready" &&
        state.url === owner.url
      );
    } catch {
      return false;
    }
  };

  registerHandler(
    invokeChannels.terminalRunConfirmed,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: DesktopCommandRequest,
    ): Promise<DesktopCommandResult> => {
      const request = validateDesktopCommandRequest(unsafeRequest);
      const confirmed = await confirmSensitiveAction({
        kind: "command",
        title: "Run command in this workspace?",
        message: request.command,
        detail: `Doolittle will run this command in the selected workspace. It will stop after at most ${Math.round(
          request.timeoutMs / 1_000,
        )} seconds.`,
        confirmLabel: "Run command",
      });
      if (!confirmed) return { status: "cancelled" };

      const state = backend.getState();
      if (state.phase !== "ready" || !state.url) {
        throw new Error("The local runtime is not ready.");
      }
      const response = await sensitiveFetch(`${state.url}/terminal/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(request.timeoutMs + 5_000),
      });
      if (!response.ok) {
        throw new Error(
          `Command failed: ${(await parseRequestError(response)).trim()}`,
        );
      }
      const payload = await parseSuccessfulJson(
        response,
        MAX_SENSITIVE_RESPONSE_BYTES,
      );
      return {
        status: "completed",
        result: isRecord(payload) ? payload.result : payload,
      };
    },
  );
  registerHandler(
    invokeChannels.terminalStreamStart,
    async (event: IpcMainInvokeEvent, unsafeRequest: TerminalStreamRequest) => {
      const request = validateTerminalStreamRequest(unsafeRequest);
      const key = terminalKey(event, request.requestId);
      if (activeTerminalRuns.has(key)) {
        throw new Error("This terminal request is already running.");
      }

      const emitEvent = (payload: { event: string; data: unknown }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send(eventChannels.terminalEvent, {
            requestId: request.requestId,
            ...payload,
          });
        }
      };
      const controller = new AbortController();
      let cleanedUp = false;
      let stopTrackingSender: () => void = () => undefined;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        activeTerminalRuns.delete(key);
        stopTrackingSender();
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };
      activeTerminalRuns.set(key, { controller });
      stopTrackingSender = trackSenderCleanup(event.sender, cleanup);

      try {
        const confirmed = await confirmSensitiveAction({
          kind: "command",
          title: "Run command in this workspace?",
          message: request.command,
          detail: `Doolittle will stream this command from the selected workspace. You can stop it at any time, and it will stop automatically after at most ${Math.round(
            request.timeoutMs / 1_000,
          )} seconds.`,
          confirmLabel: "Run command",
        });
        if (!confirmed || controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: {
              reason: controller.signal.aborted
                ? "Command stopped before it started."
                : "Command was cancelled before it started.",
            },
          });
          return;
        }

        const state = backend.getState();
        if (state.phase !== "ready" || !state.url) {
          throw new Error("The local runtime is not ready.");
        }
        const response = await sensitiveFetch(
          `${state.url}/terminal/run/stream`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              command: request.command,
              timeoutMs: request.timeoutMs,
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          throw new Error(
            `Command failed: ${(await parseRequestError(response)).trim()}`,
          );
        }
        if (!response.body) {
          throw new Error("The runtime returned an empty terminal stream.");
        }

        const parser = new SseParser();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          const chunk = decoder.decode(result.value, { stream: true });
          for (const eventMessage of parser.push(chunk)) {
            emitEvent(eventMessage);
            if (eventMessage.event === "terminal.completed") {
              notifyBackground({
                title: "Command complete",
                body: "Your terminal task finished in Doolittle.",
              });
            }
          }
        }
        const tail = decoder.decode();
        for (const eventMessage of parser.push(tail)) {
          emitEvent(eventMessage);
          if (eventMessage.event === "terminal.completed") {
            notifyBackground({
              title: "Command complete",
              body: "Your terminal task finished in Doolittle.",
            });
          }
        }
        for (const eventMessage of parser.finish()) {
          emitEvent(eventMessage);
          if (eventMessage.event === "terminal.completed") {
            notifyBackground({
              title: "Command complete",
              body: "Your terminal task finished in Doolittle.",
            });
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          emitEvent({
            event: "terminal.cancelled",
            data: { reason: "Command stopped by the operator." },
          });
        } else {
          emitEvent({
            event: "error",
            data: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
          notifyBackground({
            title: "Command needs attention",
            body: "A terminal task stopped with an error in Doolittle.",
          });
          throw error;
        }
      } finally {
        cleanup();
      }
    },
  );
  registerHandler(
    invokeChannels.terminalStreamCancel,
    (event: IpcMainInvokeEvent, requestId: string) => {
      const validated = validateTerminalRequestId(requestId);
      const active = activeTerminalRuns.get(terminalKey(event, validated));
      active?.controller.abort();
    },
  );
  registerHandler(
    invokeChannels.terminalSessionStart,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalStartRequest,
    ): Promise<InteractiveTerminalStartResult> => {
      const request = validateInteractiveTerminalStartRequest(unsafeRequest);
      if (!bots)
        throw new Error("Bot ownership is unavailable for this terminal.");
      const botId = request.botId ?? "default";
      const authorize = async () => {
        const bot = bots.get(botId);
        if (!bot.isDefault && !bot.permissions.allowMutation) {
          throw new Error("This bot cannot open a mutable terminal.");
        }
        await bots.ensureConversationOwner(botId, request.originConversationId);
        const workspacePath = bots.assertAcpWorkspace(
          botId,
          request.workspacePath,
        );
        if (workspacePath !== request.workspacePath) {
          throw new Error("Interactive terminal workspace has changed.");
        }
        return workspacePath;
      };
      const workspacePath = await authorize();
      const now = Date.now();
      const creationTimestamp = Number(request.requestId.slice(0, 13));
      if (
        creationTimestamp > now + 60_000 ||
        now - creationTimestamp > CREATION_ATTEMPT_RETENTION_MS
      ) {
        return {
          status: "unconfirmed",
          requestId: request.requestId,
          retryable: false,
          message:
            "Terminal creation could not be confirmed. This attempt has expired.",
        };
      }
      for (const [key, value] of creationAttempts) {
        if (
          now - value.createdAt > CREATION_ATTEMPT_RETENTION_MS &&
          !value.pending
        ) {
          creationAttempts.delete(key);
        }
      }
      // The identity is renderer-stable across a webContents replacement.
      // Its sealed owner/workspace fields are revalidated on every call.
      const key = request.requestId;
      let attempt = creationAttempts.get(key);
      const isNewAttempt = !attempt;
      if (attempt) {
        const prior = attempt.request;
        if (
          (prior.botId ?? "default") !== botId ||
          prior.originConversationId !== request.originConversationId ||
          prior.workspacePath !== workspacePath ||
          prior.cols !== request.cols ||
          prior.rows !== request.rows
        ) {
          throw new Error(
            "Interactive terminal request identity conflicts with an earlier request.",
          );
        }
        if (attempt.pending) {
          const result = await attempt.pending;
          await authorize();
          if (result.status === "started") {
            const unconfirmedOwner = (): InteractiveTerminalStartResult => ({
              status: "unconfirmed",
              requestId: request.requestId,
              retryable: false,
              message: "Terminal ownership could not be confirmed.",
            });
            let identity: {
              processId: number;
              runtimeInstanceId: string;
            } | null = null;
            try {
              const current = bots.readyBackendFor(botId);
              const state = current?.getState();
              if (
                current === attempt.backend &&
                state?.phase === "ready" &&
                state.url &&
                state.url === attempt.url
              ) {
                const identityUrl = state.url;
                identity = await runtimeIdentity(identityUrl, 5_000, () => {
                  try {
                    const latest = bots.readyBackendFor(botId);
                    const latestState = latest?.getState();
                    return (
                      latest === current &&
                      latestState?.phase === "ready" &&
                      latestState.url === identityUrl
                    );
                  } catch {
                    return false;
                  }
                });
              }
            } catch {
              // A failed read is uncertainty, not proof the PTY is absent.
            }
            // Grants can change while the identity body is being read. Never
            // turn an authorization denial into a transport uncertainty.
            await authorize();
            const canonicalBotId = bots.get(botId).id;
            const owner = terminalOwners.get(result.session.id);
            try {
              const current = bots.readyBackendFor(botId);
              const state = current?.getState();
              if (
                current === attempt.backend &&
                state?.phase === "ready" &&
                state.url === attempt.url &&
                identity?.runtimeInstanceId === attempt.runtimeInstanceId &&
                identity?.processId === attempt.processId &&
                owner?.backend === attempt.backend &&
                owner?.url === attempt.url &&
                owner?.runtimeInstanceId === attempt.runtimeInstanceId &&
                owner?.botId === canonicalBotId &&
                owner.originConversationId === request.originConversationId &&
                owner.workspacePath === workspacePath
              )
                return result;
            } catch {
              // The runtime or owner changed after the receipt was read.
            }
            return unconfirmedOwner();
          }
          return result;
        }
      } else {
        if (creationAttempts.size >= MAX_CREATION_ATTEMPTS) {
          throw new Error("Too many terminal creation attempts are pending.");
        }
        attempt = {
          createdAt: now,
          request,
          creationId: request.requestId,
        };
        creationAttempts.set(key, attempt);
      }
      const currentAttempt = attempt;
      // Opening an empty PTY from the trusted desktop renderer does not execute
      // a command. Typed input and command-running IPC paths remain separate,
      // validated boundaries; command execution still requires confirmation.
      const execute = async (): Promise<InteractiveTerminalStartResult> => {
        const unconfirmed = (
          retryable: boolean,
        ): InteractiveTerminalStartResult => ({
          status: "unconfirmed",
          requestId: request.requestId,
          retryable,
          message: retryable
            ? "Terminal creation could not be confirmed. Retry this tab."
            : "Terminal creation could not be confirmed. Check the runtime before retrying.",
        });
        // Named-bot activation is a separate startup operation; bound only the
        // HTTP identity, creation, and reconciliation sequence that follows it.
        let deadline = 0;
        let target: BackendManager;
        let url: string;
        const sameReadyBackend = (): boolean => {
          try {
            const current = bots.readyBackendFor(botId);
            const state = current?.getState();
            return (
              current === target &&
              state?.phase === "ready" &&
              state.url === url
            );
          } catch {
            return false;
          }
        };
        try {
          // Only the first explicit open may activate a named bot. A retry or
          // restored pending descriptor must not undo Stop work.
          target = await interactiveBackendFor(
            botId,
            isNewAttempt && !request.reconcileOnly,
          );
          deadline = Date.now() + START_POST_BOOTSTRAP_BUDGET_MS;
          const state = target.getState();
          if (state.phase !== "ready" || !state.url) return unconfirmed(false);
          url = state.url;
          if (deadline - Date.now() <= 0) return unconfirmed(false);
          const { processId, runtimeInstanceId } = await runtimeIdentity(
            url,
            deadline - Date.now(),
            sameReadyBackend,
          );
          if (
            currentAttempt.backend &&
            (currentAttempt.backend !== target ||
              currentAttempt.url !== url ||
              currentAttempt.processId !== processId ||
              currentAttempt.runtimeInstanceId !== runtimeInstanceId)
          ) {
            return unconfirmed(false);
          }
          currentAttempt.backend = target;
          currentAttempt.url = url;
          currentAttempt.processId = processId;
          currentAttempt.runtimeInstanceId = runtimeInstanceId;
        } catch (error) {
          return unconfirmed(temporarySocketFailure(error));
        }
        for (let delivery = 0; delivery < 2; delivery += 1) {
          await authorize();
          const remaining = deadline - Date.now();
          if (remaining <= 0) return unconfirmed(false);
          let payload: unknown;
          try {
            payload = await requestInteractiveTerminal(
              botId,
              "/terminal/session/start",
              "POST",
              {
                cols: request.cols,
                rows: request.rows,
                creationId: currentAttempt.creationId,
              },
              Math.min(API_TIMEOUT_MS, remaining),
              { backend: target, url },
              () => {
                try {
                  const bot = bots.get(botId);
                  if (!bot.isDefault && !bot.permissions.allowMutation) {
                    throw new Error("This bot cannot open a mutable terminal.");
                  }
                  bots.assertConversationOwner(
                    botId,
                    request.originConversationId,
                  );
                  if (
                    bots.assertAcpWorkspace(botId, request.workspacePath) !==
                    workspacePath
                  ) {
                    throw new Error(
                      "Interactive terminal workspace has changed.",
                    );
                  }
                } catch (error) {
                  throw new TerminalStartAuthorizationError(
                    error instanceof Error ? error.message : String(error),
                  );
                }
                if (!sameReadyBackend()) {
                  throw new Error(
                    "The local runtime changed during terminal creation.",
                  );
                }
              },
            );
          } catch (error) {
            if (error instanceof TerminalStartAuthorizationError) throw error;
            if (!temporarySocketFailure(error)) return unconfirmed(false);
            if (delivery === 1 || deadline - Date.now() <= 0)
              return unconfirmed(true);
            await authorize();
            try {
              const identity = await runtimeIdentity(
                url,
                deadline - Date.now(),
                sameReadyBackend,
              );
              if (
                !sameReadyBackend() ||
                deadline - Date.now() <= 0 ||
                identity.runtimeInstanceId !==
                  currentAttempt.runtimeInstanceId ||
                identity.processId !== currentAttempt.processId
              ) {
                return unconfirmed(false);
              }
            } catch {
              return unconfirmed(false);
            }
            await authorize();
            continue;
          }
          if (
            !isRecord(payload) ||
            !isRecord(payload.session) ||
            payload.runtimeInstanceId !== currentAttempt.runtimeInstanceId
          )
            return unconfirmed(false);
          let session: InteractiveTerminalSession;
          try {
            session = validateInteractiveTerminalSession(payload.session);
          } catch {
            return unconfirmed(false);
          }
          await authorize();
          let currentIdentity: {
            processId: number;
            runtimeInstanceId: string;
          } | null = null;
          try {
            if (sameReadyBackend() && deadline - Date.now() > 0) {
              currentIdentity = await runtimeIdentity(
                url,
                deadline - Date.now(),
                sameReadyBackend,
              );
            }
          } catch {
            return unconfirmed(false);
          }
          await authorize();
          if (
            !sameReadyBackend() ||
            !currentIdentity ||
            currentIdentity.runtimeInstanceId !==
              currentAttempt.runtimeInstanceId ||
            currentIdentity.processId !== currentAttempt.processId
          )
            return unconfirmed(false);
          const canonicalBotId = bots.get(botId).id;
          const owner = terminalOwners.get(session.id);
          if (owner) {
            if (
              owner.botId !== canonicalBotId ||
              owner.originConversationId !== request.originConversationId ||
              owner.workspacePath !== workspacePath ||
              owner.backend !== target ||
              owner.url !== url ||
              owner.runtimeInstanceId !== currentIdentity.runtimeInstanceId ||
              owner.processId !== currentIdentity.processId
            )
              return unconfirmed(false);
          } else {
            terminalOwners.set(session.id, {
              botId: canonicalBotId,
              originConversationId: request.originConversationId,
              workspacePath,
              backend: target,
              url,
              processId: currentIdentity.processId,
              runtimeInstanceId: currentIdentity.runtimeInstanceId,
            });
          }
          return { status: "started", session };
        }
        return unconfirmed(false);
      };
      currentAttempt.pending = execute();
      try {
        return await currentAttempt.pending;
      } finally {
        currentAttempt.pending = undefined;
      }
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalInputRequest,
    ) => {
      const request = validateInteractiveTerminalInputRequest(unsafeRequest);
      if (
        !(await matchesTerminalRuntime(
          request.sessionId,
          request.botId ?? "default",
        ))
      ) {
        throw new Error("Interactive terminal runtime has changed.");
      }
      const payload = await requestInteractiveTerminal(
        request.botId ?? "default",
        "/terminal/session/input",
        "POST",
        { sessionId: request.sessionId, data: request.data },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionResize,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalResizeRequest,
    ) => {
      const request = validateInteractiveTerminalResizeRequest(unsafeRequest);
      if (
        !(await matchesTerminalRuntime(
          request.sessionId,
          request.botId ?? "default",
        ))
      ) {
        throw new Error("Interactive terminal runtime has changed.");
      }
      const payload = await requestInteractiveTerminal(
        request.botId ?? "default",
        "/terminal/session/resize",
        "POST",
        {
          sessionId: request.sessionId,
          cols: request.cols,
          rows: request.rows,
        },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInterrupt,
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeBotId?: string,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const botId = validateTerminalBotId(unsafeBotId);
      if (!(await matchesTerminalRuntime(sessionId, botId))) {
        throw new Error("Interactive terminal runtime has changed.");
      }
      const payload = await requestInteractiveTerminal(
        botId,
        "/terminal/session/interrupt",
        "POST",
        { sessionId },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionClose,
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeBotId?: string,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const botId = validateTerminalBotId(unsafeBotId);
      if (!(await matchesTerminalRuntime(sessionId, botId))) {
        throw new Error("Interactive terminal runtime has changed.");
      }
      const payload = await requestInteractiveTerminal(
        botId,
        "/terminal/session/close",
        "POST",
        { sessionId },
      );
      const session = validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
      return session;
    },
  );
  registerHandler(
    invokeChannels.terminalSessionOutput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeCursor: number,
      unsafeBotId?: string,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const botId = validateTerminalBotId(unsafeBotId);
      assertTerminalOwner(sessionId, botId);
      if (!matchesTerminalBackend(sessionId, botId)) {
        return {
          status: "unconfirmed",
          sessionId,
          retryable: false,
          message:
            "Terminal output could not be confirmed. The runtime has changed.",
        } satisfies InteractiveTerminalOutputResult;
      }
      const cursor =
        typeof unsafeCursor === "number" &&
        Number.isSafeInteger(unsafeCursor) &&
        unsafeCursor >= 0
          ? unsafeCursor
          : 0;
      try {
        const payload = await requestInteractiveTerminal(
          botId,
          `/terminal/session/output?sessionId=${encodeURIComponent(
            sessionId,
          )}&cursor=${cursor}`,
          "GET",
        );
        const owner = terminalOwners.get(sessionId);
        if (
          !matchesTerminalBackend(sessionId, botId) ||
          !isRecord(payload) ||
          payload.runtimeInstanceId !== owner?.runtimeInstanceId
        )
          throw new Error("Interactive terminal runtime has changed.");
        const output = validateInteractiveTerminalOutput(payload);
        if (output.session.id !== sessionId) {
          throw new Error("The runtime returned a different terminal session.");
        }
        assertTerminalOwner(sessionId, botId);
        return {
          status: "available",
          output,
        } satisfies InteractiveTerminalOutputResult;
      } catch (error) {
        assertTerminalOwner(sessionId, botId);
        if (!matchesTerminalBackend(sessionId, botId)) {
          return {
            status: "unconfirmed",
            sessionId,
            retryable: false,
            message:
              "Terminal output could not be confirmed. The runtime has changed.",
          } satisfies InteractiveTerminalOutputResult;
        }
        if (
          error instanceof TerminalRuntimeHttpError &&
          error.status === 404 &&
          error.code === "terminal-session-not-found" &&
          error.runtimeInstanceId ===
            terminalOwners.get(sessionId)?.runtimeInstanceId
        ) {
          return {
            status: "absent",
            sessionId,
          } satisfies InteractiveTerminalOutputResult;
        }
        return {
          status: "unconfirmed",
          sessionId,
          retryable: temporarySocketFailure(error),
          message:
            "Terminal output could not be confirmed. The session may still be running.",
        } satisfies InteractiveTerminalOutputResult;
      }
    },
  );
}
