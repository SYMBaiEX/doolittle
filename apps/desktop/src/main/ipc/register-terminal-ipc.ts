import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type {
  DesktopCommandRequest,
  DesktopCommandResult,
  InteractiveTerminalInputRequest,
  InteractiveTerminalResizeRequest,
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
  validateTerminalRequestId,
  validateTerminalStreamRequest,
} from "./ipc-validation";
import { parseRequestError, parseSuccessfulJson } from "./runtime-http";

const API_TIMEOUT_MS = 15_000;
const MAX_SENSITIVE_RESPONSE_BYTES = 2_000_000;

interface ActiveTerminalRun {
  controller: AbortController;
}

type RegisterHandler = (
  channel: DesktopIpcInvokeChannel,
  handler: Parameters<IpcMain["handle"]>[1],
) => void;

export interface TerminalIpcRegistrationContext {
  backend: BackendManager;
  registerHandler: RegisterHandler;
  activeTerminalRuns: Map<string, ActiveTerminalRun>;
  confirmSensitiveAction: (
    request: SensitiveActionConfirmationRequest,
  ) => Promise<boolean>;
  sensitiveFetch: typeof fetch;
  notifyBackground: (notification: DesktopBackgroundNotification) => void;
}

function terminalKey(event: IpcMainInvokeEvent, requestId: string): string {
  return `${event.sender.id}:${requestId}`;
}

export function registerTerminalIpcHandlers(
  context: TerminalIpcRegistrationContext,
): void {
  const {
    backend,
    registerHandler,
    activeTerminalRuns,
    confirmSensitiveAction,
    sensitiveFetch,
    notifyBackground,
  } = context;
  const { event: eventChannels, invoke: invokeChannels } = desktopIpcChannels;

  const requestInteractiveTerminal = async (
    path:
      | "/terminal/session/start"
      | "/terminal/session/input"
      | "/terminal/session/resize"
      | "/terminal/session/interrupt"
      | "/terminal/session/close"
      | `/terminal/session/output?${string}`,
    method: "GET" | "POST",
    body?: object,
  ): Promise<unknown> => {
    const state = backend.getState();
    if (state.phase !== "ready" || !state.url) {
      throw new Error("The local runtime is not ready.");
    }
    const response = await sensitiveFetch(`${state.url}${path}`, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Interactive terminal request failed: ${(await parseRequestError(response)).trim()}`,
      );
    }
    return parseSuccessfulJson(response, MAX_SENSITIVE_RESPONSE_BYTES);
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
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        activeTerminalRuns.delete(key);
        event.sender.removeListener("destroyed", cleanup);
        if (!controller.signal.aborted) {
          controller.abort();
        }
      };
      activeTerminalRuns.set(key, { controller });
      event.sender.once("destroyed", cleanup);

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
      // Opening an empty PTY from the trusted desktop renderer does not execute
      // a command. Typed input and command-running IPC paths remain separate,
      // validated boundaries; command execution still requires confirmation.
      const payload = await requestInteractiveTerminal(
        "/terminal/session/start",
        "POST",
        request,
      );
      if (!isRecord(payload) || !isRecord(payload.session)) {
        throw new Error("The runtime returned an invalid terminal session.");
      }
      return {
        status: "started",
        session: validateInteractiveTerminalSession(payload.session),
      };
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeRequest: InteractiveTerminalInputRequest,
    ) => {
      const request = validateInteractiveTerminalInputRequest(unsafeRequest);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/input",
        "POST",
        request,
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
      const payload = await requestInteractiveTerminal(
        "/terminal/session/resize",
        "POST",
        request,
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionInterrupt,
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
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
    async (_event: IpcMainInvokeEvent, unsafeSessionId: string) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const payload = await requestInteractiveTerminal(
        "/terminal/session/close",
        "POST",
        { sessionId },
      );
      return validateInteractiveTerminalSession(
        isRecord(payload) ? payload.session : undefined,
      );
    },
  );
  registerHandler(
    invokeChannels.terminalSessionOutput,
    async (
      _event: IpcMainInvokeEvent,
      unsafeSessionId: string,
      unsafeCursor: number,
    ) => {
      const sessionId = validateInteractiveTerminalSessionId(unsafeSessionId);
      const cursor =
        typeof unsafeCursor === "number" &&
        Number.isSafeInteger(unsafeCursor) &&
        unsafeCursor >= 0
          ? unsafeCursor
          : 0;
      return requestInteractiveTerminal(
        `/terminal/session/output?sessionId=${encodeURIComponent(
          sessionId,
        )}&cursor=${cursor}`,
        "GET",
      ).then(validateInteractiveTerminalOutput);
    },
  );
}
