import { createRuntimeAccountStoragePolicy } from "@elizaos/auth/auth/account-storage";
import {
  cancelFlow,
  type FlowState,
  getFlowState,
  startAnthropicOAuthFlow,
  startCodexOAuthFlow,
  submitFlowCode,
} from "@elizaos/auth/auth/oauth-flow";
import type { AppContext } from "../runtime/bootstrap/index";
import { refreshDoolittleAccountPoolInventory } from "../runtime/native/account-pool/index";
import { readRouteJsonBody } from "./request-body";
import { json } from "./responses";

const PROVIDERS = {
  codex: {
    host: "auth.openai.com",
    label: "Codex",
    start: startCodexOAuthFlow,
  },
  "claude-code": {
    host: "claude.ai",
    label: "Claude",
    start: startAnthropicOAuthFlow,
  },
} as const;
type Provider = keyof typeof PROVIDERS;
type OwnedFlow = { id: string; codeSubmitted: boolean };
// At most one record per provider and application runtime. The SDK owns
// timeouts, credential persistence, PKCE validation, and callback listeners.
const ownedFlows = new WeakMap<
  AppContext,
  Map<Provider, OwnedFlow | "starting">
>();

function visibleState(
  provider: Provider,
  state: FlowState,
  codeSubmitted: boolean,
) {
  const account = state.account;
  return {
    id: state.sessionId,
    provider,
    status: state.status,
    needsCodeSubmission: state.needsCodeSubmission,
    codeSubmitted,
    ...(state.status === "pending" && state.authUrl
      ? { authUrl: state.authUrl }
      : {}),
    ...(account
      ? {
          account: {
            id: account.id,
            label: account.label,
            providerId: account.providerId,
          },
        }
      : {}),
  };
}

function validAuthorizationUrl(provider: Provider, value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === `https://${PROVIDERS[provider].host}` &&
      url.pathname === "/oauth/authorize" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      url.searchParams.getAll("state").length === 1
    );
  } catch {
    return false;
  }
}

function validSubmittedCode(
  provider: Provider,
  state: FlowState,
  value: unknown,
): value is string {
  if (
    typeof value !== "string" ||
    !/^[\x21-\x7e]{1,8192}$/u.test(value) ||
    !state.authUrl
  )
    return false;
  const expectedState = new URL(state.authUrl).searchParams.get("state");
  if (provider === "claude-code") {
    const [code, receivedState, extra] = value.split("#");
    return Boolean(
      code &&
        receivedState &&
        extra === undefined &&
        expectedState === receivedState,
    );
  }
  try {
    const callback = new URL(value);
    return (
      callback.origin === "http://localhost:1455" &&
      callback.pathname === "/auth/callback" &&
      !callback.username &&
      !callback.password &&
      !callback.hash &&
      callback.searchParams.getAll("code").length === 1 &&
      Boolean(callback.searchParams.get("code")) &&
      callback.searchParams.getAll("state").length === 1 &&
      callback.searchParams.get("state") === expectedState
    );
  } catch {
    return false;
  }
}

async function start(
  context: AppContext,
  request: Request,
  flows: Map<Provider, OwnedFlow | "starting">,
  body: Record<string, unknown>,
) {
  const { provider, label, accountId } = body;
  if (
    (provider !== "codex" && provider !== "claude-code") ||
    (label !== undefined &&
      (typeof label !== "string" ||
        !label.trim() ||
        label.length > 120 ||
        /[\p{Cc}\p{Cf}]/u.test(label))) ||
    (accountId !== undefined &&
      (typeof accountId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/u.test(accountId))) ||
    Object.keys(body).some(
      (key) => key !== "provider" && key !== "label" && key !== "accountId",
    )
  )
    return json(
      { error: "A supported provider and valid account details are required." },
      400,
    );

  const current = flows.get(provider);
  if (current === "starting")
    return json({ error: "Provider sign-in is starting." }, 409);
  const existing = current ? getFlowState(current.id) : null;
  if (current && existing?.status === "pending") {
    return json({
      flow: visibleState(provider, existing, current.codeSubmitted),
    });
  }

  flows.set(provider, "starting");
  try {
    request.signal.throwIfAborted();
    const sdkFlow = await PROVIDERS[provider].start({
      storagePolicy: createRuntimeAccountStoragePolicy(context.config.dataDir),
      label: label?.trim() || `${PROVIDERS[provider].label} native account`,
      ...(accountId ? { accountId } : {}),
    });
    if (
      request.signal.aborted ||
      !validAuthorizationUrl(provider, sdkFlow.authUrl)
    ) {
      sdkFlow.cancel("Provider authorization could not be opened.");
      request.signal.throwIfAborted();
      return json(
        { error: "Provider authorization URL was unavailable." },
        503,
      );
    }
    const state = getFlowState(sdkFlow.sessionId);
    if (!state)
      return json({ error: "Provider sign-in was unavailable." }, 503);
    flows.set(provider, { id: sdkFlow.sessionId, codeSubmitted: false });
    void sdkFlow.completion.then(
      () => {
        try {
          refreshDoolittleAccountPoolInventory();
        } catch {
          /* SDK account remains saved. */
        }
      },
      () => undefined,
    );
    return json({ flow: visibleState(provider, state, false) });
  } catch {
    return json({ error: "Provider sign-in could not be started." }, 503);
  } finally {
    if (flows.get(provider) === "starting") flows.delete(provider);
  }
}

export async function handleNativeProviderOAuth(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response> {
  let flows = ownedFlows.get(context);
  if (!flows) {
    flows = new Map();
    ownedFlows.set(context, flows);
  }

  const command = url.pathname.split("/").at(-1);
  const parsed =
    request.method === "POST" ? await readRouteJsonBody(request) : { body: {} };
  if ("response" in parsed) return parsed.response;
  if (command === "start") return start(context, request, flows, parsed.body);

  const ids = url.searchParams.getAll("flowId");
  const flowId =
    request.method === "GET" && ids.length === 1 ? ids[0] : parsed.body.flowId;
  if (typeof flowId !== "string" || !/^[0-9a-f-]{36}$/u.test(flowId))
    return json({ error: "A valid provider sign-in ID is required." }, 400);
  for (const [provider, owned] of flows) {
    if (owned === "starting" || owned.id !== flowId) continue;
    const state = getFlowState(flowId);
    if (!state) break;
    if (command === "cancel") {
      if (!cancelFlow(flowId))
        return json({ error: "Provider sign-in ended." }, 409);
    } else if (command === "code") {
      if (owned.codeSubmitted || state.status !== "pending")
        return json(
          { error: "Provider sign-in is no longer accepting codes." },
          409,
        );
      if (!validSubmittedCode(provider, state, parsed.body.code))
        return json(
          { error: "Paste the provider callback value for this sign-in." },
          400,
        );
      if (!submitFlowCode(flowId, parsed.body.code))
        return json(
          { error: "Provider sign-in could not accept the code." },
          409,
        );
      owned.codeSubmitted = true;
    }
    return json({
      flow: visibleState(
        provider,
        getFlowState(flowId) ?? state,
        owned.codeSubmitted,
      ),
    });
  }
  return json(
    { error: "Provider sign-in was not found in this runtime." },
    404,
  );
}
