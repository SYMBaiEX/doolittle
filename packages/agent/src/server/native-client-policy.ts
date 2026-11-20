import type { IncomingMessage } from "node:http";
import { tokenMatches } from "@elizaos/agent/api/server-helpers-auth";
import {
  ExecutionAdmissionLimitError,
  NativeWorkspaceChangedError,
} from "../runtime/execution-admission";
import {
  isNativeNamedBotRoute,
  nativeControlRouteAllowed,
} from "./native-control-routes";
import { json } from "./responses";
import { NATIVE_ATTACHMENT_IMPORT } from "./routes/native-attachments";

export const NATIVE_WORKSPACE_SAVE_PATH = "/workspace/write";
export const NATIVE_REPOSITORY_MUTATION_PATH = "/repo/mutate";
export const NATIVE_WORKSPACE_SAVE_MAX_BODY_BYTES = 8 * 1024 * 1024;

export function nativeWorkspaceAdmissionError(error: unknown): Response {
  if (error instanceof NativeWorkspaceChangedError)
    return json({ error: error.message, code: "workspace_changed" }, 409);
  if (error instanceof ExecutionAdmissionLimitError)
    return json({ error: error.message, code: "workspace_busy" }, 409);
  throw error;
}

const NATIVE_READ_ROUTES = new Set([
  "/health",
  "/runtime/bot-identity",
  "/runtime/status",
  "/runtime/models",
  "/sessions",
  "/sessions/messages",
  "/chat/runs",
  "/projects",
  "/workspace/tree",
  "/workspace/read",
  "/workspace/search",
  "/repo/status",
  "/repo/summary",
  "/repo/changes",
  "/repo/diff",
  "/execution/approvals",
  "/cron/jobs",
  "/cron/runs",
  "/gateway/health",
  "/gateway/runtime",
  "/media/library",
  "/tools",
]);
const NATIVE_DESKTOP_READ_ROUTES = new Set([
  "/repo/branches",
  "/repo/conflicts",
  "/repo/log",
  "/repo/patch",
  "/repo/review",
  "/repo/worktrees",
  "/terminal/history",
  "/workspace/checkpoints",
]);
const RUN_PATH =
  /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,128}(?:\/(events|cancel))?$/iu;
const NATIVE_MEDIA_ASSET_PATH = /^\/media\/library\/[a-z0-9][a-z0-9-]{0,180}$/u;
const NATIVE_TOKEN = /^[a-f0-9]{64}$/u;

interface NativeClientRejection {
  status: 401 | 403 | 404 | 409;
  error: string;
}

export interface NativeClientSecurityOptions {
  bearerToken: string;
  allowWorkspaceSave?: boolean;
  controlPlane?: boolean;
  dispatchNamedBotControl?: (
    request: Request,
    url: URL,
  ) => Promise<Response | null>;
  workspaceIsCurrent(): boolean;
}

function nativeRouteAllowed(
  method: string,
  path: string,
  options: NativeClientSecurityOptions,
  controlRoute: boolean,
): boolean {
  const runRoute = RUN_PATH.exec(path);
  if (controlRoute) return true;
  if (method === "GET") {
    return (
      NATIVE_READ_ROUTES.has(path) ||
      (options.allowWorkspaceSave === true &&
        (NATIVE_DESKTOP_READ_ROUTES.has(path) ||
          NATIVE_MEDIA_ASSET_PATH.test(path))) ||
      (runRoute !== null &&
        (runRoute[1] === undefined || runRoute[1] === "events"))
    );
  }
  return (
    method === "POST" &&
    (path === "/chat/runs" ||
      runRoute?.[1] === "cancel" ||
      (path === NATIVE_REPOSITORY_MUTATION_PATH &&
        options.allowWorkspaceSave === true &&
        options.controlPlane === true) ||
      ((path === NATIVE_WORKSPACE_SAVE_PATH ||
        path === NATIVE_ATTACHMENT_IMPORT) &&
        options.allowWorkspaceSave === true))
  );
}

/** A process-owned client capability. The regular CLI and desktop API are separate listeners. */
export function createNativeClientPolicy(options: NativeClientSecurityOptions) {
  if (!NATIVE_TOKEN.test(options.bearerToken)) {
    throw new Error("Native API requires a 32-byte bearer capability.");
  }
  const token = `Bearer ${options.bearerToken}`;
  return (
    request: IncomingMessage,
    path: string,
  ): NativeClientRejection | null => {
    const target = request.url ?? "";
    if (
      request.headers.host !== `127.0.0.1:${request.socket.localPort}` ||
      request.headers.origin !== undefined ||
      !target.startsWith("/") ||
      target.startsWith("//") ||
      target.includes("\\") ||
      target.includes("#") ||
      target.split("?", 1)[0] !== path
    ) {
      return { status: 403, error: "Forbidden native API origin." };
    }
    const header = request.headers.authorization;
    if (typeof header !== "string" || !tokenMatches(token, header)) {
      return { status: 401, error: "Unauthorized" };
    }
    const method = request.method ?? "GET";
    const controlRoute =
      options.controlPlane === true &&
      (nativeControlRouteAllowed(method, path) ||
        (options.dispatchNamedBotControl !== undefined &&
          isNativeNamedBotRoute(method, path)));
    if (
      ((path === NATIVE_WORKSPACE_SAVE_PATH ||
        path === NATIVE_ATTACHMENT_IMPORT ||
        path === NATIVE_REPOSITORY_MUTATION_PATH) &&
        target !== path) ||
      (controlRoute && method !== "GET" && target !== path) ||
      !nativeRouteAllowed(method, path, options, controlRoute)
    ) {
      return { status: 404, error: "Not found" };
    }
    if (!options.workspaceIsCurrent()) {
      return {
        status: 409,
        error:
          "The native workspace changed. Restart Doolittle in the selected workspace.",
      };
    }
    return null;
  };
}
