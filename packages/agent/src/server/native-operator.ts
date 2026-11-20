import { isRuntimeReasoningEffort } from "@doolittle/contracts/model-route";
import { RUN_DEPTHS, TOOL_PROGRESS_MODES } from "@doolittle/contracts/run";
import type { AppContext } from "../runtime/bootstrap/index";
import { withLinkedProviderMutationLock } from "../runtime/linked-provider-accounts/index";
import {
  applyAccountPoolApiCredentials,
  importDoolittleApiAccount,
} from "../runtime/native/account-pool/index";
import { ensureDoolittleDirectApiPlugins } from "../runtime/native/plugin-registry/providers";
import type { RuntimeSettings } from "../services/settings-service";
import { handleNativeProviderOAuth } from "./native-provider-oauth";
import { readRouteJsonBody } from "./request-body";
import { json } from "./responses";
import { handleAcpRoutes } from "./routes/acp";
import { stopRuntimeExecutions } from "./routes/runtime/status";
import { applyRuntimeSettingChanges } from "./routes/settings-execution";

const inList = (options: readonly string[]) => (value: unknown) =>
  typeof value === "string" && options.includes(value);
const integer = (min: number, max: number) => (value: unknown) =>
  typeof value === "number" &&
  Number.isSafeInteger(value) &&
  value >= min &&
  value <= max;
const text = (max: number) => (value: unknown) =>
  typeof value === "string" &&
  value.length <= max &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const bool = (value: unknown) => typeof value === "boolean";

function baseUrl(value: unknown): boolean {
  if (typeof value !== "string" || !text(2_048)(value)) return false;
  if (value === "") return true;
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

// Native settings are an operator projection. In particular, an MCP server's
// launch args, environment, or remote URL may contain credential material.
const SETTING_FIELDS = {
  model: {
    provider: (value: unknown) =>
      typeof value === "string" &&
      /^[A-Za-z0-9@][A-Za-z0-9@/_.-]{0,159}$/u.test(value),
    model: (value: unknown) => text(160)(value) && value !== "",
    baseUrl,
    reasoningEffort: (value: unknown) =>
      value === null || isRuntimeReasoningEffort(value),
    maxTokens: integer(1, 1_000_000),
    temperature: (value: unknown) =>
      typeof value === "number" && value >= 0 && value <= 2,
  },
  agent: {
    runDepth: inList(RUN_DEPTHS),
    toolProgressMode: inList(TOOL_PROGRESS_MODES),
    maxIterations: integer(1, 1000),
  },
  gateway: {
    sessionTimeoutMinutes: integer(1, 43_200),
    mirrorResponsesToHistory: bool,
  },
  execution: {
    backend: inList([
      "local",
      "docker",
      "ssh",
      "singularity",
      "daytona",
      "modal",
    ]),
    remoteSyncMode: inList(["mirror", "upload", "none"]),
    remoteArtifactPolicy: inList(["metadata-only", "download", "ignore"]),
    commandTimeoutMs: integer(100, 3_600_000),
    healthTimeoutMs: integer(100, 3_600_000),
    containerReadOnlyRoot: bool,
    sshStrictHostKeyChecking: bool,
  },
  mcp: { maxRetries: integer(0, 10) },
} satisfies Record<string, Record<string, (value: unknown) => boolean>>;

type Validator = (value: unknown) => boolean;
const ACCEPTED_SETTING_FIELDS = new Map<string, Validator>(
  Object.entries(SETTING_FIELDS).flatMap(([section, fields]) =>
    Object.entries<Validator>(fields).map(
      ([name, check]) => [`${section}.${name}`, check] as const,
    ),
  ),
);

function publicSettings(settings: RuntimeSettings) {
  return Object.fromEntries(
    Object.entries(SETTING_FIELDS).map(([section, fields]) => {
      const values = settings[
        section as keyof typeof SETTING_FIELDS
      ] as unknown as Record<string, unknown>;
      return [
        section,
        Object.fromEntries(
          Object.entries<Validator>(fields)
            .filter(([name, check]) => check(values[name]))
            .map(([name]) => [name, values[name]]),
        ),
      ];
    }),
  );
}

async function nativeSettings(
  context: AppContext,
  request: Request,
): Promise<Response> {
  if (request.method === "GET") {
    return json({ settings: publicSettings(context.services.settings.get()) });
  }
  const parsed = await readRouteJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const requested: unknown[] = Array.isArray(parsed.body.changes)
    ? parsed.body.changes
    : [parsed.body];
  if (requested.length < 1 || requested.length > 32) {
    return json({ error: "One to 32 setting changes are required." }, 400);
  }
  const changes: Array<{ path: string; value: unknown }> = [];
  const fields = new Set<string>();
  for (const entry of requested) {
    if (
      !entry ||
      typeof entry !== "object" ||
      !("path" in entry) ||
      typeof entry.path !== "string" ||
      !("value" in entry) ||
      fields.has(entry.path) ||
      !ACCEPTED_SETTING_FIELDS.get(entry.path)?.(entry.value)
    ) {
      return json(
        {
          error:
            "The setting or value is unavailable in the native control plane.",
        },
        400,
      );
    }
    fields.add(entry.path);
    changes.push({ path: entry.path, value: entry.value });
  }
  const settings = await applyRuntimeSettingChanges(
    context,
    changes,
    request.signal,
  );
  return json({ settings: publicSettings(settings) });
}

async function nativeProviderCredential(
  context: AppContext,
  request: Request,
  provider: "openai-api" | "anthropic-api",
): Promise<Response> {
  const parsed = await readRouteJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { accountId, label, apiKey } = parsed.body;
  if (
    Object.keys(parsed.body).length !== 3 ||
    typeof accountId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(accountId) ||
    typeof label !== "string" ||
    !label.trim() ||
    !text(120)(label) ||
    typeof apiKey !== "string" ||
    !/^[\x21-\x7e]{1,8192}$/u.test(apiKey)
  ) {
    return json(
      { error: "A valid account ID, label, and API key are required." },
      400,
    );
  }
  return withLinkedProviderMutationLock(context.runtime, async () => {
    request.signal.throwIfAborted();
    let account: ReturnType<typeof importDoolittleApiAccount>;
    try {
      account = importDoolittleApiAccount(provider, accountId, label, apiKey);
    } catch {
      // Never put SDK exceptions from credential persistence in the logs or UI.
      return json(
        { error: "The provider credential could not be stored." },
        503,
      );
    }
    if (!account)
      return json(
        { error: "The provider credential could not be confirmed." },
        503,
      );
    try {
      await applyAccountPoolApiCredentials({
        activeBackend: context.services.settings.get().model.provider,
      });
      await ensureDoolittleDirectApiPlugins(context.runtime);
      return json({ account, applied: true });
    } catch {
      // The SDK already persisted the account. Report that separately from
      // live runtime activation so retry cannot look like a fresh save.
      return json({ account, applied: false });
    }
  });
}

/** Explicit operator-only adapters around owned Doolittle and Eliza services. */
export function handleNativeOperatorRoute(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> | null {
  if (url.pathname === "/settings") return nativeSettings(context, request);
  if (url.pathname.startsWith("/accounts/oauth/"))
    return handleNativeProviderOAuth(context, request, url);
  if (url.pathname.startsWith("/acp/"))
    return handleAcpRoutes(context, request, url, {
      nativeWorkspace: context.config.workspaceDir,
    });
  if (request.method !== "POST") return null;
  if (url.pathname === "/runtime/executions/stop-all") {
    return stopRuntimeExecutions(context);
  }
  const provider =
    /^\/runtime\/account-pool\/(openai-api|anthropic-api)\/credentials$/u.exec(
      url.pathname,
    )?.[1];
  return provider === "openai-api" || provider === "anthropic-api"
    ? nativeProviderCredential(context, request, provider)
    : null;
}
