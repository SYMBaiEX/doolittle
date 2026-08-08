import type { AppContext } from "@/runtime/bootstrap";
import { withLinkedProviderMutationLock } from "@/runtime/linked-provider-accounts";
import {
  deleteDoolittleAccount,
  importCurrentDoolittleAccount,
  isAccountPoolProvider,
  refreshDoolittleAccountUsage,
  selectDoolittleAccount,
  setDoolittleAccountPoolStrategy,
  snapshotDoolittleAccountPool,
  testDoolittleAccountCredentials,
  updateDoolittleAccount,
} from "@/runtime/native/account-pool";
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
  const accountPoolRoute = url.pathname.match(
    /^\/runtime\/account-pool\/(openai-codex|anthropic-subscription)(?:\/([^/]+)(?:\/(test|refresh-usage))?)?$/,
  );
  if (request.method === "GET" && url.pathname === "/runtime/account-pool") {
    return json(snapshotDoolittleAccountPool());
  }

  if (accountPoolRoute) {
    const providerId = accountPoolRoute[1];
    const accountId = accountPoolRoute[2];
    const action = accountPoolRoute[3];
    if (!isAccountPoolProvider(providerId)) return null;

    if (request.method === "POST" && accountId && action === "test") {
      const result = await testDoolittleAccountCredentials(
        providerId,
        accountId,
      );
      return result ? json(result) : json({ error: "account not found" }, 404);
    }

    if (request.method === "POST" && accountId && action === "refresh-usage") {
      const result = await refreshDoolittleAccountUsage(providerId, accountId);
      return result ? json(result) : json({ error: "account not found" }, 404);
    }

    if (request.method === "POST" && accountId === "import") {
      const body = (await request.json().catch(() => ({}))) as {
        accountId?: unknown;
        label?: unknown;
      };
      if (
        typeof body.accountId !== "string" ||
        typeof body.label !== "string"
      ) {
        return json({ error: "accountId and label are required" }, 400);
      }
      try {
        const account = importCurrentDoolittleAccount(
          providerId,
          body.accountId,
          body.label,
        );
        return account
          ? json({ account })
          : json({ error: "no linked native credentials are available" }, 409);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "invalid account import",
          },
          400,
        );
      }
    }

    if (request.method === "POST" && accountId === "strategy") {
      const body = (await request.json().catch(() => ({}))) as {
        strategy?: unknown;
      };
      try {
        return json({
          providerId,
          strategy: setDoolittleAccountPoolStrategy(providerId, body.strategy),
        });
      } catch (error) {
        return json(
          {
            error: error instanceof Error ? error.message : "invalid strategy",
          },
          400,
        );
      }
    }

    if (request.method === "POST" && accountId === "select") {
      const body = (await request.json().catch(() => ({}))) as {
        strategy?: unknown;
        sessionKey?: unknown;
      };
      return json({
        account: await selectDoolittleAccount(providerId, body),
      });
    }

    if (request.method === "PATCH" && accountId) {
      const body = (await request.json().catch(() => ({}))) as {
        label?: unknown;
        enabled?: unknown;
        priority?: unknown;
      };
      try {
        const account = await updateDoolittleAccount(
          providerId,
          accountId,
          body,
        );
        return account
          ? json({ account })
          : json({ error: "account not found" }, 404);
      } catch (error) {
        return json(
          {
            error:
              error instanceof Error ? error.message : "invalid account update",
          },
          400,
        );
      }
    }

    if (request.method === "DELETE" && accountId) {
      const deleted = await deleteDoolittleAccount(providerId, accountId);
      return deleted
        ? json({ deleted: true, credentialsRetained: false })
        : json({ error: "account not found" }, 404);
    }
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/runtime/accounts" || url.pathname === "/accounts")
  ) {
    return json({
      activeProvider: context.services.settings.get().model.provider,
      accounts: getAccountsSnapshot(context),
      connect: buildAccountConnectAdvice(),
    });
  }

  if (request.method === "GET" && url.pathname === "/accounts/doctor") {
    return json({
      accounts: getAccountsSnapshot(context),
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
          error:
            "provider must be elizacloud, codex, claude-code, devin, or all",
        },
        400,
      );
    }
    try {
      return json(await refreshAccounts(context, provider));
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
        { error: "provider must be elizacloud, codex, claude-code, or devin" },
        400,
      );
    }
    return json(
      await withLinkedProviderMutationLock(context.runtime, async () =>
        activateAccount(context, provider),
      ),
    );
  }

  if (request.method === "POST" && url.pathname === "/accounts/connect") {
    const body = (await request.json()) as {
      provider?: string;
    };
    const provider = readLinkedProvider(body.provider);
    if (!provider) {
      return json(
        { error: "provider must be elizacloud, codex, claude-code, or devin" },
        400,
      );
    }
    try {
      return json(
        await withLinkedProviderMutationLock(context.runtime, () =>
          connectAccount(context, provider),
        ),
      );
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
        { error: "provider must be elizacloud, codex, claude-code, or devin" },
        400,
      );
    }
    return json(getAccountLoginDetails(context, provider));
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
      command: getAccountLoginDetails(context, "claude-code").setupCommand,
      advice: getAccountLoginDetails(context, "claude-code").advice,
      accounts: getAccountsSnapshot(context),
    });
  }

  return null;
}
