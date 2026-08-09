import type { AppContext } from "@/runtime/bootstrap";
import {
  createEffectiveSandbox,
  executeEffectiveSandboxCode,
  killEffectiveSandbox,
  listEffectiveSandboxes,
} from "@/runtime/native/service-bridge/autocoder";
import { getNativeExecutionControlPlane } from "@/runtime/native/service-bridge/control-planes";
import { json } from "@/server/responses";

type JsonObject = Record<string, unknown>;

function badRequest(error: string): Response {
  return json({ error }, 400);
}

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isPlainObject(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

async function readJsonObject(
  request: Request,
): Promise<JsonObject | Response> {
  try {
    const body: unknown = await request.json();
    return isPlainObject(body)
      ? body
      : badRequest("Request body must be a JSON object");
  } catch {
    return badRequest("Request body must be valid JSON");
  }
}

function optionalNonEmptyString(
  body: JsonObject,
  field: "template" | "language" | "sandboxId" | "id",
): string | undefined | Response {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    return badRequest(`${field} must be a non-empty string`);
  }
  return value;
}

function sandboxErrorResponse(error: unknown): Response | undefined {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (code === "SANDBOX_NOT_FOUND") {
    return json({ error: message, code }, 404);
  }
  if (code === "UNSUPPORTED_SANDBOX_TEMPLATE") {
    return json(
      {
        error: message,
        code,
        supportedTemplates: ["node-js", "python"],
      },
      400,
    );
  }
  if (
    code === "SANDBOX_CLOSING" ||
    code === "SANDBOX_OWNERSHIP_CONFLICT" ||
    code === "SANDBOX_CLEANUP_UNVERIFIED"
  ) {
    return json({ error: message, code }, 409);
  }
  return undefined;
}

export async function handleSandboxRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/runtime/e2b") {
    return json({
      e2b: getNativeExecutionControlPlane(context.runtime).e2b,
    });
  }

  if (request.method === "GET" && url.pathname === "/e2b/sandboxes") {
    return json({
      control: getNativeExecutionControlPlane(context.runtime).e2b,
      sandboxes: listEffectiveSandboxes(context.runtime),
    });
  }

  if (request.method === "POST" && url.pathname === "/e2b/sandboxes") {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const template = optionalNonEmptyString(body, "template");
    if (template instanceof Response) return template;
    const metadata = body.metadata;
    if (metadata !== undefined && !isStringRecord(metadata)) {
      return badRequest("metadata must be a plain object with string values");
    }
    try {
      return json({
        sandboxId: await createEffectiveSandbox(context.runtime, {
          template,
          metadata,
        }),
        sandboxes: listEffectiveSandboxes(context.runtime),
      });
    } catch (error) {
      const response = sandboxErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/e2b/execute") {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    if (body.code === undefined) {
      return json({ error: "code is required" }, 400);
    }
    if (typeof body.code !== "string" || body.code.length === 0) {
      return badRequest("code must be a non-empty string");
    }
    const language = optionalNonEmptyString(body, "language");
    if (language instanceof Response) return language;
    const sandboxId = optionalNonEmptyString(body, "sandboxId");
    if (sandboxId instanceof Response) return sandboxId;
    try {
      return json({
        result: await executeEffectiveSandboxCode(
          context.runtime,
          body.code,
          language ?? "python",
          sandboxId,
        ),
      });
    } catch (error) {
      const response = sandboxErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  if (request.method === "POST" && url.pathname === "/e2b/kill") {
    const body = await readJsonObject(request);
    if (body instanceof Response) return body;
    const id = optionalNonEmptyString(body, "id");
    if (id instanceof Response) return id;
    try {
      await killEffectiveSandbox(context.runtime, id);
      return json({
        killed: id ?? "active",
        sandboxes: listEffectiveSandboxes(context.runtime),
      });
    } catch (error) {
      const response = sandboxErrorResponse(error);
      if (response) return response;
      throw error;
    }
  }

  return null;
}
