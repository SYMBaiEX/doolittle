import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountPoolPanel } from "./AccountPoolPanel";
import { ProviderConnectionRow } from "./ProviderConnectionRow";

const noop = () => undefined;
const asyncNoop = async () => undefined;

describe("provider account surfaces", () => {
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
        onRefresh={noop}
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

    expect(markup).toContain("Bridge ready");
    expect(markup).toContain("No accounts yet");
    expect(markup).toContain("Set up first account");
    expect(markup).toContain("Sign in &amp; add");
    expect(markup).toContain("private local store");
    expect(markup).toContain('class="provider-pool-toolbar"');
    expect(markup).toContain('aria-label="Pool readiness"');
    expect(markup).toContain("automatic fallback");
    expect(markup).not.toContain("Pool setup progress");
    expect(markup).not.toContain("Add a backup account");
  });
});
