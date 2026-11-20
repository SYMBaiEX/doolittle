import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

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
const RUN_PATH =
  /^\/chat\/runs\/(?:[a-zA-Z0-9:_-]|%3A){1,128}(?:\/(events|cancel))?$/iu;
const NATIVE_TOKEN = /^[a-f0-9]{64}$/u;

interface NativeClientRejection {
  status: 401 | 403 | 404 | 409;
  error: string;
}

export interface NativeClientSecurityOptions {
  bearerToken: string;
  workspaceIsCurrent(): boolean;
}

function nativeRouteAllowed(method: string, path: string): boolean {
  const runRoute = RUN_PATH.exec(path);
  if (method === "GET") {
    return (
      NATIVE_READ_ROUTES.has(path) ||
      (runRoute !== null &&
        (runRoute[1] === undefined || runRoute[1] === "events"))
    );
  }
  return (
    method === "POST" && (path === "/chat/runs" || runRoute?.[1] === "cancel")
  );
}

/** A process-owned client capability. The regular CLI and desktop API are separate listeners. */
export function createNativeClientPolicy(options: NativeClientSecurityOptions) {
  if (!NATIVE_TOKEN.test(options.bearerToken)) {
    throw new Error("Native API requires a 32-byte bearer capability.");
  }
  const token = Buffer.from(`Bearer ${options.bearerToken}`);
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
      target.includes("\\")
    ) {
      return { status: 403, error: "Forbidden native API origin." };
    }
    const header = request.headers.authorization;
    if (
      typeof header !== "string" ||
      header.length !== token.length ||
      !/^[\x20-\x7e]+$/u.test(header) ||
      !timingSafeEqual(token, Buffer.from(header))
    ) {
      return { status: 401, error: "Unauthorized" };
    }
    if (!nativeRouteAllowed(request.method ?? "GET", path)) {
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
