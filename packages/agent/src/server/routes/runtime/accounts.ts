import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  activateAccount,
  buildAccountConnectAdvice,
  connectAccount,
  getAccountLoginDetails,
  getAccountsSnapshot,
  readLinkedProvider,
  refreshAccounts,
} from "./shared";

export async function handleRuntimeAccountRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    request.method === "GET" &&
    (url.pathname === "/runtime/accounts" || url.pathname === "/accounts")
  ) {
    return json({
      activeProvider: context.services.settings.get().model.provider,
      accounts: getAccountsSnapshot(),
      connect: buildAccountConnectAdvice(),
    });
  }

  if (request.method === "GET" && url.pathname === "/accounts/doctor") {
    return json({
      accounts: getAccountsSnapshot(),
      connect: buildAccountConnectAdvice(),
    });
  }

  if (request.method === "POST" && url.pathname === "/accounts/refresh") {
    const body = (await request.json().catch(() => ({}))) as {
      provider?: string;
    };
    const provider =
      readLinkedProvider(body.provider) ??
      (body.provider === undefined || body.provider === "all"
        ? "all"
        : undefined);
    if (!provider) {
      return json(
        {
          error: "provider must be elizacloud, codex, claude-code, or all",
        },
        400,
      );
    }
    try {
      return json(await refreshAccounts(provider));
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "refresh failed",
        },
        500,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/accounts/use") {
    const body = (await request.json()) as {
      provider?: string;
    };
    const provider = readLinkedProvider(body.provider);
    if (!provider) {
      return json(
        { error: "provider must be elizacloud, codex, or claude-code" },
        400,
      );
    }
    return json(activateAccount(context, provider));
  }

  if (request.method === "POST" && url.pathname === "/accounts/connect") {
    const body = (await request.json()) as {
      provider?: string;
    };
    const provider = readLinkedProvider(body.provider);
    if (!provider) {
      return json(
        { error: "provider must be elizacloud, codex, or claude-code" },
        400,
      );
    }
    try {
      return json(await connectAccount(context, provider));
    } catch (error) {
      return json(
        {
          error: error instanceof Error ? error.message : "connect failed",
        },
        500,
      );
    }
  }

  if (request.method === "POST" && url.pathname === "/accounts/login") {
    const body = (await request.json()) as {
      provider?: string;
    };
    const provider = readLinkedProvider(body.provider);
    if (!provider) {
      return json(
        { error: "provider must be elizacloud, codex, or claude-code" },
        400,
      );
    }
    return json(getAccountLoginDetails(provider));
  }

  if (request.method === "POST" && url.pathname === "/accounts/setup-token") {
    const body = (await request.json()) as {
      provider?: string;
    };
    if (body.provider !== "claude-code") {
      return json({ error: "provider must be claude-code" }, 400);
    }
    return json({
      provider: body.provider,
      command: getAccountLoginDetails("claude-code").setupCommand,
      advice: getAccountLoginDetails("claude-code").advice,
      accounts: getAccountsSnapshot(),
    });
  }

  return null;
}
