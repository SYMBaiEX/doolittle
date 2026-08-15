import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { providerRouteLabel, providerSelectionLabel } from "../ConnectionsPage";
import { AccountPoolPanel } from "./AccountPoolPanel";
import { ProviderConnectionRow } from "./ProviderConnectionRow";
import { ProviderRouteSummary } from "./ProviderRouteSummary";

const noop = () => undefined;
const asyncNoop = async () => undefined;

describe("provider account surfaces", () => {
  it("summarizes chat routing without repeating the provider roster", () => {
    const markup = renderToStaticMarkup(
      <ProviderRouteSummary activeProvider="Claude Code" ready={3} total={4} />,
    );

    expect(markup).toContain('aria-label="Chat provider status"');
    expect(markup).toContain("Ready");
    expect(markup).toContain("3/4");
    expect(markup).toContain("New chats");
    expect(markup).toContain("Claude Code");
    expect(markup).not.toContain("Current route");
  });

  it("makes an unselected chat route actionable in the summary", () => {
    const markup = renderToStaticMarkup(
      <ProviderRouteSummary ready={0} total={4} />,
    );

    expect(markup).toContain("0/4");
    expect(markup).toContain("Choose provider");
  });

  it("keeps provider status, facts, and routing action in one compact row", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionRow
        busy={false}
        descriptor={{
          key: "codex",
          label: "Codex",
          shortLabel: "CX",
          accountSignIn: true,
        }}
        isDefault={false}
        onCancelSignIn={noop}
        onConnect={noop}
        onSetDefault={noop}
        onSignIn={noop}
        onSubmitCode={noop}
        ready={true}
        status={{
          detail: "Signed in",
          source: "Codex app",
          accountLabel: "Work",
          nativeReady: true,
        }}
      />,
    );

    expect(markup).toContain('data-provider-connection="true"');
    expect(markup).toContain("provider-identity-mark");
    expect(markup).toContain("Codex app");
    expect(markup).toContain("Work");
    expect(markup).toContain("Native");
    expect(markup).toContain("Use for chats");
    expect(markup).toContain('data-provider-status="ready"');
    expect(markup).toContain("provider-connection-more");
    expect(markup).toContain('aria-label="More actions for Codex"');
    expect(markup).toContain("bg-bg-accent");
    expect(markup).toContain("h-9");
  });

  it("names active non-account chat routes instead of asking for a provider", () => {
    expect(providerRouteLabel("ollama")).toBe("Ollama");
    expect(providerRouteLabel("openai-codex")).toBe("OpenAI Codex");
    expect(providerRouteLabel("codex")).toBe("Codex");
    expect(providerRouteLabel(undefined)).toBeUndefined();
  });

  it("does not advertise an unavailable selected provider for new chats", () => {
    expect(
      providerSelectionLabel({
        configuredProvider: "codex",
        selectedProviderLabel: "Codex",
        selectedProviderReady: false,
      }),
    ).toBe("Needs sign-in");
    expect(
      providerSelectionLabel({
        configuredProvider: "codex",
        selectedProviderLabel: "Codex",
        selectedProviderReady: true,
      }),
    ).toBe("Codex");
    expect(
      providerSelectionLabel({
        configuredProvider: "ollama",
        selectedProviderReady: false,
      }),
    ).toBe("Ollama");
  });

  it("does not present CLI fallback as an authenticated subscription", () => {
    const markup = renderToStaticMarkup(
      <ProviderConnectionRow
        busy={false}
        descriptor={{
          key: "claude-code",
          label: "Claude Code",
          shortLabel: "CC",
          accountSignIn: true,
        }}
        isDefault={false}
        onCancelSignIn={noop}
        onConnect={noop}
        onSetDefault={noop}
        onSignIn={noop}
        onSubmitCode={noop}
        ready
        status={{
          detail: "OAuth expired",
          fallbackReady: true,
          nativeReady: false,
        }}
      />,
    );

    expect(markup).toContain("CLI fallback");
    expect(markup).toContain("subscription sign-in needs attention");
    expect(markup).toContain("Use CLI fallback");
    expect(markup).toContain('aria-label="More actions for Claude Code"');
    expect(markup).not.toContain(
      "Authenticated through the official Claude Code client.",
    );
  });

  it("does not let route selection hide an unavailable provider", () => {
    const unavailable = renderToStaticMarkup(
      <ProviderConnectionRow
        busy={false}
        descriptor={{
          key: "codex",
          label: "Codex",
          shortLabel: "CX",
          accountSignIn: true,
        }}
        isDefault
        onCancelSignIn={noop}
        onConnect={noop}
        onSetDefault={noop}
        onSignIn={noop}
        onSubmitCode={noop}
        ready={false}
        status={{}}
      />,
    );

    expect(unavailable).toContain("Needs sign-in");
    expect(unavailable).not.toContain(">Default<");
  });

  it("labels a ready selected provider as in use", () => {
    const inUse = renderToStaticMarkup(
      <ProviderConnectionRow
        busy={false}
        descriptor={{
          key: "codex",
          label: "Codex",
          shortLabel: "CX",
          accountSignIn: true,
        }}
        isDefault
        onCancelSignIn={noop}
        onConnect={noop}
        onSetDefault={noop}
        onSignIn={noop}
        onSubmitCode={noop}
        ready
        status={{ nativeReady: true }}
      />,
    );

    expect(inUse).toContain("In use");
    expect(inUse).not.toContain(">Default<");
  });

  it("renders an explicit unavailable pool instead of an indefinite spinner", () => {
    const markup = renderToStaticMarkup(
      <AccountPoolPanel
        authProvider="codex"
        bridgeInstalled={false}
        busy=""
        descriptor={{
          label: "Codex",
          shortLabel: "CX",
          provider: "openai-codex",
        }}
        onAccountImportChange={noop}
        onDelete={asyncNoop}
        onMove={asyncNoop}
        onPatch={asyncNoop}
        onPreview={noop}
        onRefreshUsage={asyncNoop}
        onSetStrategy={noop}
        onSignIn={noop}
        onTest={asyncNoop}
      />,
    );

    expect(markup).toContain("Pool unavailable");
    expect(markup).toContain("Account pool is not available");
    expect(markup).not.toContain("Loading account pool");
  });

  it("makes an empty native pool actionable and explains the credential boundary", () => {
    const markup = renderToStaticMarkup(
      <AccountPoolPanel
        accountImport={{ accountId: "", label: "" }}
        authProvider="claude-code"
        bridgeInstalled
        busy=""
        descriptor={{
          label: "Claude Code",
          shortLabel: "CC",
          provider: "anthropic-subscription",
        }}
        onAccountImportChange={noop}
        onDelete={asyncNoop}
        onMove={asyncNoop}
        onPatch={asyncNoop}
        onPreview={noop}
        onRefreshUsage={asyncNoop}
        onSetStrategy={noop}
        onSignIn={noop}
        onTest={asyncNoop}
        snapshot={{ strategy: "priority", accounts: [] }}
      />,
    );

    expect(markup).toContain("Eliza native");
    expect(markup).toContain("Accounts");
    expect(markup).toContain("Connect account");
    expect(markup).toContain("Sign in &amp; add");
    expect(markup).toContain("Credentials stay local in Eliza");
    expect(markup).toContain('data-provider-pool-toolbar="true"');
    expect(markup).toContain('aria-label="Pool readiness"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('data-provider-pool-body="true" hidden=""');
    expect(markup).toContain("automatic fallback");
    expect(markup).not.toContain("Pool setup progress");
    expect(markup).not.toContain("Add a backup account");
  });

  it("offers an explicit native login repair for an unusable pool account", () => {
    const markup = renderToStaticMarkup(
      <AccountPoolPanel
        authProvider="claude-code"
        bridgeInstalled
        busy=""
        descriptor={{
          label: "Claude Code",
          shortLabel: "CC",
          provider: "anthropic-subscription",
        }}
        onAccountImportChange={noop}
        onDelete={asyncNoop}
        onMove={asyncNoop}
        onPatch={asyncNoop}
        onPreview={noop}
        onRefreshUsage={asyncNoop}
        onSetStrategy={noop}
        onSignIn={noop}
        onTest={asyncNoop}
        snapshot={{
          strategy: "priority",
          accounts: [
            {
              providerId: "anthropic-subscription",
              accountId: "local-claude",
              label: "Claude Code on this Mac",
              source: "oauth",
              enabled: true,
              priority: 0,
              createdAt: 1,
              health: "needs-reauth",
            },
          ],
        }}
      />,
    );

    expect(markup).toContain("Repair auth");
    expect(markup).toContain("Add account");
  });

  it("keeps API-key pools distinct from OAuth and names the existing secret", () => {
    const markup = renderToStaticMarkup(
      <AccountPoolPanel
        accountImport={{
          accountId: "work",
          label: "OpenAI work",
          secretKeyName: "OPENAI_API_KEY",
        }}
        bridgeInstalled
        busy=""
        descriptor={{
          label: "OpenAI API",
          shortLabel: "OA",
          provider: "openai-api",
        }}
        direct
        onAccountImportChange={noop}
        onDelete={asyncNoop}
        onImportDirect={asyncNoop}
        onMove={asyncNoop}
        onPatch={asyncNoop}
        onPreview={noop}
        onRefreshUsage={asyncNoop}
        onSetStrategy={noop}
        onSignIn={noop}
        onTest={asyncNoop}
        snapshot={{ strategy: "priority", accounts: [] }}
      />,
    );

    expect(markup).toContain("Eliza secret name");
    expect(markup).toContain("OPENAI_API_KEY");
    expect(markup).toContain("Add API account");
    expect(markup).not.toContain("Sign in &amp; add");
    expect(markup).toContain('data-direct-account-pool="true"');
  });
});
