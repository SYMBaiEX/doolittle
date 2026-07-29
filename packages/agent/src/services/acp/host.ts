import { randomUUID } from "node:crypto";
import { TextDecoder, TextEncoder } from "node:util";
import type {
  CreateTerminalRequest,
  CreateTerminalResponse,
  KillTerminalRequest,
  ReadTextFileRequest,
  ReleaseTerminalRequest,
  RequestPermissionRequest,
  RequestPermissionResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
} from "@doolittle/acp";
import type { AppContext } from "@/runtime/bootstrap";
import { executeAgentTurnWithProgress } from "@/runtime/turn-stream";
import {
  assertWorkspacePathResolvesInside,
  resolveWorkspacePath,
} from "../workspace-service/path";
import type { AcpProtocolHost } from "./types";

interface AcpTerminalState {
  id: string;
  sessionId: string;
  controller: AbortController;
  output: string;
  truncated: boolean;
  outputByteLimit?: number;
  exitStatus?: { exitCode?: number | null; signal?: string | null };
  completion: Promise<{ exitCode?: number | null; signal?: string | null }>;
}

export function createAcpProtocolHost(context: AppContext): AcpProtocolHost {
  const terminals = new Map<string, AcpTerminalState>();
  return {
    assertWorkspacePath(path) {
      const resolved = resolveWorkspacePath(
        context.services.workspace.root(),
        path,
      );
      assertWorkspacePathResolvesInside(
        context.services.workspace.root(),
        resolved,
      );
    },
    readWorkspace(path, options) {
      const content = context.services.workspace.read(path);
      return sliceTextFile(content, options);
    },
    writeWorkspace(path, content) {
      return context.services.workspace.write(path, content);
    },
    requestPermission(params, signal) {
      return requestPermission(context, params, signal);
    },
    createTerminal(params, signal) {
      if (params._meta?.["doolittle/permission-granted"] !== true) {
        throw new Error(
          "ACP terminal creation requires an approved permission request.",
        );
      }
      const cwd = params.cwd ?? context.services.workspace.root();
      const resolvedCwd = resolveWorkspacePath(
        context.services.workspace.root(),
        cwd,
      );
      assertWorkspacePathResolvesInside(
        context.services.workspace.root(),
        resolvedCwd,
      );
      const id = `terminal:${randomUUID()}`;
      const controller = new AbortController();
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      const state: AcpTerminalState = {
        id,
        sessionId: params.sessionId,
        controller,
        output: "",
        truncated: false,
        outputByteLimit: params.outputByteLimit ?? undefined,
        completion: Promise.resolve({}),
      };
      state.completion = context.services.terminal
        .runStreamingLocal(
          buildTerminalCommand(params, resolvedCwd),
          {
            onStdout: (chunk) => appendTerminalOutput(state, chunk),
            onStderr: (chunk) => appendTerminalOutput(state, chunk),
          },
          undefined,
          controller.signal,
        )
        .then((record) => {
          state.exitStatus = {
            exitCode: record.exitCode,
            signal: controller.signal.aborted ? "SIGTERM" : undefined,
          };
          return state.exitStatus;
        })
        .catch((error) => {
          if (!controller.signal.aborted) throw error;
          state.exitStatus = { exitCode: null, signal: "SIGTERM" };
          return state.exitStatus;
        })
        .finally(() => {
          signal.removeEventListener("abort", abort);
        });
      terminals.set(id, state);
      return Promise.resolve({ terminalId: id });
    },
    terminalOutput(params) {
      const state = requireTerminal(terminals, params);
      return {
        output: state.output,
        truncated: state.truncated,
        exitStatus: state.exitStatus,
      };
    },
    async waitForTerminalExit(params) {
      return requireTerminal(terminals, params).completion;
    },
    async killTerminal(params) {
      requireTerminal(terminals, params).controller.abort();
    },
    async releaseTerminal(params) {
      const state = requireTerminal(terminals, params);
      state.controller.abort();
      terminals.delete(state.id);
    },
    async executeTurn(input) {
      const result = await executeAgentTurnWithProgress(
        {
          message: input.message,
          userId: "acp-user",
          roomId: input.sessionId,
          source: "api",
        },
        context,
        {
          abortSignal: input.signal,
          onProgress: ({ delta }) => input.onText(delta),
          onRunUpdate: input.onRunUpdate,
        },
      );
      return result.response;
    },
  };
}

async function requestPermission(
  context: AppContext,
  params: RequestPermissionRequest,
  signal: AbortSignal,
): Promise<RequestPermissionResponse> {
  const allowOptions = params.options.filter((option) =>
    option.kind.startsWith("allow"),
  );
  const rejectOptions = params.options.filter((option) =>
    option.kind.startsWith("reject"),
  );
  const record = await context.services.executionApprovals.request({
    platform: "api",
    userId: "acp-user",
    roomId: params.sessionId,
    sessionKey: params.sessionId,
    command: permissionCommand(params),
    reason: params.toolCall.title ?? "ACP tool request",
  });
  const status = await waitForApproval(context, record.id, signal);
  if (status === "approved" || status === "used") {
    const option = allowOptions[0];
    return option
      ? {
          outcome: { outcome: "selected", optionId: option.optionId },
          _meta: { "doolittle/approval-id": record.id },
        }
      : { outcome: { outcome: "cancelled" } };
  }
  const option = rejectOptions[0];
  return option
    ? {
        outcome: { outcome: "selected", optionId: option.optionId },
        _meta: { "doolittle/approval-id": record.id },
      }
    : { outcome: { outcome: "cancelled" } };
}

async function waitForApproval(
  context: AppContext,
  id: string,
  signal: AbortSignal,
): Promise<"approved" | "denied" | "expired" | "used"> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (
      value: "approved" | "denied" | "expired" | "used" | Error,
    ) => {
      if (timer) clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      value instanceof Error ? reject(value) : resolve(value);
    };
    const onAbort = () =>
      finish(new Error("ACP permission request cancelled."));
    const poll = () => {
      const status = context.services.executionApprovals.get(id)?.status;
      if (
        status === "approved" ||
        status === "denied" ||
        status === "expired" ||
        status === "used"
      ) {
        finish(status);
        return;
      }
      timer = setTimeout(poll, 100);
      timer.unref?.();
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    poll();
  });
}

function permissionCommand(params: RequestPermissionRequest): string {
  const input =
    params.toolCall.rawInput &&
    typeof params.toolCall.rawInput === "object" &&
    !Array.isArray(params.toolCall.rawInput)
      ? params.toolCall.rawInput
      : {};
  const path = "path" in input ? String(input.path) : undefined;
  const command = "command" in input ? String(input.command) : undefined;
  return [
    `ACP ${params.toolCall.kind ?? "tool"}`,
    path ? `path=${path}` : undefined,
    command ? `command=${command}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");
}

function sliceTextFile(content: string, options?: ReadTextFileRequest): string {
  if (!options?.line && !options?.limit) return content;
  const lines = content.split(/\r?\n/u);
  const start = Math.max(0, (options.line ?? 1) - 1);
  const end =
    options.limit && options.limit > 0 ? start + options.limit : undefined;
  return lines.slice(start, end).join("\n");
}

function buildTerminalCommand(
  params: CreateTerminalRequest,
  cwd: string,
): string {
  const environment = (params.env ?? [])
    .map((entry) => {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(entry.name)) {
        throw new Error(`Invalid ACP terminal environment name: ${entry.name}`);
      }
      return `${entry.name}=${shellQuote(entry.value)}`;
    })
    .join(" ");
  const executable = [params.command, ...(params.args ?? [])]
    .map(shellQuote)
    .join(" ");
  return [
    `cd ${shellQuote(cwd)}`,
    environment ? `${environment} ${executable}` : executable,
  ].join(" && ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function appendTerminalOutput(state: AcpTerminalState, chunk: string): void {
  state.output += chunk;
  if (!state.outputByteLimit) return;
  const encoder = new TextEncoder();
  const encoded = encoder.encode(state.output);
  if (encoded.byteLength <= state.outputByteLimit) return;
  state.truncated = true;
  const tail = encoded.slice(encoded.byteLength - state.outputByteLimit);
  state.output = new TextDecoder("utf-8", { fatal: false }).decode(tail);
}

function requireTerminal(
  terminals: Map<string, AcpTerminalState>,
  params:
    | TerminalOutputRequest
    | WaitForTerminalExitRequest
    | KillTerminalRequest
    | ReleaseTerminalRequest,
): AcpTerminalState {
  const state = terminals.get(params.terminalId);
  if (!state || state.sessionId !== params.sessionId) {
    throw new Error(`ACP terminal not found: ${params.terminalId}`);
  }
  return state;
}

export type {
  CreateTerminalResponse,
  TerminalOutputResponse,
  WaitForTerminalExitResponse,
};
