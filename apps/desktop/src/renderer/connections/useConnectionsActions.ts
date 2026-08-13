import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AccountPoolAccount,
  AccountPoolDeleteResponse,
  AccountPoolProvider,
  AccountPoolResponse,
  AccountPoolStrategy,
  ProviderAuthProvider,
  ProviderAuthState,
} from "../../shared/contracts";
import {
  type AccountImportDraft,
  clearAccountImportDraft,
} from "../agent-pages-helpers";
import {
  type ActionFeedback,
  type ApiResource,
  asString,
  desktopRequest,
  errorMessage,
  titleCase,
} from "../lib";

export interface AccountsResponse {
  activeProvider?: string;
  accounts?: Record<string, unknown>;
  connect?: Record<string, unknown>;
}

function accountPoolProviderFor(
  provider: ProviderAuthProvider,
): AccountPoolProvider {
  return provider === "codex" ? "openai-codex" : "anthropic-subscription";
}

export function useConnectionsActions({
  accountPool,
  active,
  accounts,
}: {
  accountPool: ApiResource<AccountPoolResponse>;
  active: boolean;
  accounts: ApiResource<AccountsResponse>;
}) {
  const [busy, setBusy] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<
    Partial<Record<AccountPoolProvider, string>>
  >({});
  const [accountImports, setAccountImports] = useState<
    Partial<Record<AccountPoolProvider, AccountImportDraft>>
  >({});
  const [authStates, setAuthStates] = useState<
    Partial<Record<ProviderAuthProvider, ProviderAuthState>>
  >({});
  const completedAuth = useRef(new Set<ProviderAuthProvider>());

  const setAuthState = useCallback((state: ProviderAuthState) => {
    setAuthStates((current) => ({ ...current, [state.provider]: state }));
  }, []);

  const finishAccountSignIn = useCallback(
    async (provider: ProviderAuthProvider) => {
      if (completedAuth.current.has(provider)) return;
      completedAuth.current.add(provider);
      setBusy(`${provider}:finish-sign-in`);
      try {
        await desktopRequest("/accounts/refresh", "POST", { provider });
        const result = await desktopRequest<Record<string, unknown>>(
          "/accounts/connect",
          "POST",
          { provider },
        );
        setFeedback({
          message:
            asString(result.detail) ||
            `${titleCase(provider)} is signed in and ready to use.`,
          tone: "good",
        });
        const poolProvider = accountPoolProviderFor(provider);
        setAccountImports((current) =>
          clearAccountImportDraft(current, poolProvider),
        );
        accountPool.reload();
        setAuthState(await window.doolittle.acknowledgeProviderAuth(provider));
        accounts.reload();
      } catch (error) {
        completedAuth.current.delete(provider);
        setFeedback({ message: errorMessage(error), tone: "bad" });
      } finally {
        setBusy("");
      }
    },
    [accountPool.reload, accounts.reload, setAuthState],
  );

  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void Promise.all(
      (["codex", "claude-code"] as const).map((provider) =>
        window.doolittle.getProviderAuthState(provider),
      ),
    )
      .then((states) => {
        if (!mounted) return;
        setAuthStates(
          Object.fromEntries(states.map((state) => [state.provider, state])),
        );
        for (const state of states) {
          if (state.phase === "succeeded") {
            void finishAccountSignIn(state.provider);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [active, finishAccountSignIn]);

  const pendingAuthProviders = (["codex", "claude-code"] as const).filter(
    (provider) => {
      const phase = authStates[provider]?.phase;
      return phase === "launching" || phase === "waiting";
    },
  );
  useIntervalWhenDocumentVisible(
    () => {
      for (const provider of pendingAuthProviders) {
        void window.doolittle
          .getProviderAuthState(provider)
          .then((state) => {
            setAuthState(state);
            if (state.phase === "succeeded") {
              void finishAccountSignIn(provider);
            }
          })
          .catch((error) =>
            setFeedback({ message: errorMessage(error), tone: "bad" }),
          );
      }
    },
    1_000,
    active && pendingAuthProviders.length > 0,
  );

  const startAccountSignIn = async (provider: ProviderAuthProvider) => {
    completedAuth.current.delete(provider);
    setBusy(`${provider}:sign-in`);
    setFeedback(null);
    try {
      const draft = accountImports[accountPoolProviderFor(provider)];
      const state = await window.doolittle.startProviderAuth(provider, {
        accountId: draft?.accountId.trim() || undefined,
        label: draft?.label.trim() || undefined,
      });
      setAuthState(state);
      if (state.phase === "succeeded") {
        await finishAccountSignIn(provider);
      } else if (state.phase === "failed") {
        setFeedback({ message: state.message, tone: "bad" });
      }
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const submitAccountSignInCode = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:submit-code`);
    setFeedback(null);
    try {
      setAuthState(await window.doolittle.submitProviderAuthCode(provider));
      setFeedback({
        message: `${titleCase(provider)} sign-in code submitted.`,
        tone: "good",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const cancelAccountSignIn = async (provider: ProviderAuthProvider) => {
    setBusy(`${provider}:cancel-sign-in`);
    setFeedback(null);
    try {
      setAuthState(await window.doolittle.cancelProviderAuth(provider));
      setFeedback({
        message: `${titleCase(provider)} sign-in cancelled.`,
        tone: "neutral",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const mutate = async (
    provider: string,
    action: "refresh" | "use" | "connect" | "login",
  ) => {
    setBusy(`${provider}:${action}`);
    setFeedback(null);
    try {
      const result = await desktopRequest<Record<string, unknown>>(
        `/accounts/${action}`,
        "POST",
        { provider },
      );
      const detail =
        asString(result.detail) ||
        asString(result.advice) ||
        `${titleCase(provider)} ${action} request completed.`;
      setFeedback({ message: detail, tone: "good" });
      accounts.reload();
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const updateAccount = async (
    provider: AccountPoolProvider,
    account: Pick<AccountPoolAccount, "accountId" | "label">,
    changes: Partial<
      Pick<AccountPoolAccount, "label" | "enabled" | "priority">
    >,
  ) => {
    setBusy(`${provider}:${account.accountId}:update`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.accountId)}`,
        "PATCH",
        changes,
      );
      setFeedback({ message: `${account.label} was updated.`, tone: "good" });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const selectAccount = async (provider: AccountPoolProvider) => {
    setBusy(`${provider}:select`);
    setFeedback(null);
    try {
      const result = await desktopRequest<{
        account?: AccountPoolAccount | null;
      }>(`/runtime/account-pool/${provider}/select`, "POST");
      if (result.account) {
        setSelectedAccounts((current) => ({
          ...current,
          [provider]: result.account?.accountId,
        }));
        setFeedback({
          message: `Strategy selected ${result.account.label} for this preview; spawned agents select per session.`,
          tone: "good",
        });
      } else {
        setFeedback({
          message: "No enabled account is available for this provider.",
          tone: "warn",
        });
      }
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const setPoolStrategy = async (
    provider: AccountPoolProvider,
    strategy: AccountPoolStrategy,
  ) => {
    setBusy(`${provider}:strategy`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/strategy`,
        "POST",
        { strategy },
      );
      setFeedback({
        message: `${titleCase(provider)} rotation strategy updated.`,
        tone: "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const testPoolAccount = async (
    provider: AccountPoolProvider,
    account: AccountWithCredentialFlag,
  ) => {
    setBusy(`${provider}:${account.id}:test`);
    setFeedback(null);
    try {
      const result = await desktopRequest<{
        ok: boolean;
        latencyMs?: number;
        error?: string;
      }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/test`,
        "POST",
      );
      setFeedback({
        message: result.ok
          ? `${account.label} passed its credential check${typeof result.latencyMs === "number" ? ` in ${result.latencyMs}ms` : ""}.`
          : `${account.label} failed its credential check: ${result.error ?? "unknown provider error"}`,
        tone: result.ok ? "good" : "bad",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const refreshPoolAccountUsage = async (
    provider: AccountPoolProvider,
    account: AccountWithCredentialFlag,
  ) => {
    setBusy(`${provider}:${account.id}:usage`);
    setFeedback(null);
    try {
      const result = await desktopRequest<{ error?: string }>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}/refresh-usage`,
        "POST",
      );
      setFeedback({
        message: result.error
          ? `${account.label} usage could not be refreshed: ${result.error}`
          : `${account.label} usage and health were refreshed.`,
        tone: result.error ? "bad" : "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const movePoolAccount = async (
    provider: AccountPoolProvider,
    poolAccounts: AccountWithCredentialFlag[],
    accountId: string,
    direction: "up" | "down",
  ) => {
    const index = poolAccounts.findIndex((account) => account.id === accountId);
    const neighbourIndex = direction === "up" ? index - 1 : index + 1;
    const account = poolAccounts[index];
    const neighbour = poolAccounts[neighbourIndex];
    if (!account || !neighbour || account.priority === neighbour.priority) {
      return;
    }
    setBusy(`${provider}:${account.id}:reorder`);
    setFeedback(null);
    try {
      await desktopRequest(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}`,
        "PATCH",
        { priority: neighbour.priority },
      );
      try {
        await desktopRequest(
          `/runtime/account-pool/${provider}/${encodeURIComponent(neighbour.id)}`,
          "PATCH",
          { priority: account.priority },
        );
      } catch (error) {
        await desktopRequest(
          `/runtime/account-pool/${provider}/${encodeURIComponent(account.id)}`,
          "PATCH",
          { priority: account.priority },
        ).catch(() => undefined);
        throw error;
      }
      setFeedback({
        message: `${account.label} priority was updated.`,
        tone: "good",
      });
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      accountPool.reload();
      setBusy("");
    }
  };

  const deleteAccount = async (
    provider: AccountPoolProvider,
    account: AccountPoolAccount,
  ) => {
    setBusy(`${provider}:${account.accountId}:delete`);
    setFeedback(null);
    try {
      const result = await desktopRequest<AccountPoolDeleteResponse>(
        `/runtime/account-pool/${provider}/${encodeURIComponent(account.accountId)}`,
        "DELETE",
      );
      if (!result.deleted || result.credentialsRetained !== false) {
        throw new Error(
          "The account was not disconnected from credential storage.",
        );
      }
      setSelectedAccounts((current) => {
        const next = { ...current };
        if (next[provider] === account.accountId) delete next[provider];
        return next;
      });
      setFeedback({
        message: `${account.label} was disconnected and removed.`,
        tone: "good",
      });
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  const importDirectAccount = async (
    provider: Extract<AccountPoolProvider, "openai-api" | "anthropic-api">,
    draft: AccountImportDraft,
  ) => {
    setBusy(`${provider}:import`);
    setFeedback(null);
    try {
      await desktopRequest(`/runtime/account-pool/${provider}/import`, "POST", {
        accountId: draft.accountId.trim(),
        label: draft.label.trim(),
        secretKeyName: draft.secretKeyName?.trim(),
      });
      setFeedback({
        message: `${draft.label || provider} was added.`,
        tone: "good",
      });
      setAccountImports((current) =>
        clearAccountImportDraft(current, provider),
      );
      accountPool.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusy("");
    }
  };

  return {
    accountImports,
    authStates,
    busy,
    cancelAccountSignIn,
    deleteAccount,
    feedback,
    importDirectAccount,
    movePoolAccount,
    mutate,
    refreshPoolAccountUsage,
    selectAccount,
    selectedAccounts,
    setAccountImports,
    setPoolStrategy,
    startAccountSignIn,
    submitAccountSignInCode,
    testPoolAccount,
    updateAccount,
  };
}
