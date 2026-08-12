import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

    expect(markup).toContain('class="provider-connection-row"');
    expect(markup).toContain('class="provider-identity-mark"');
    expect(markup).toContain("Codex app");
    expect(markup).toContain("Work");
    expect(markup).toContain("Native");
    expect(markup).toContain("Use for chats");
    expect(markup).toContain("Add account");
    expect(markup).toContain("provider-connection-secondary");
    expect(markup).toContain("bg-bg-accent");
    expect(markup).toContain("h-9");
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
    expect(markup).toContain("subscription OAuth still needs attention");
    expect(markup).toContain("Use CLI fallback");
    expect(markup).toContain("Repair sign-in");
    expect(markup).not.toContain(
      "Authenticated through the official Claude Code client.",
    );
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
    expect(markup).toContain('class="provider-pool-toolbar"');
    expect(markup).toContain('aria-label="Pool readiness"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('class="provider-pool-body" hidden=""');
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
});
