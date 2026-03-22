import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function loadSnapshotModule() {
  return import(`./account-auth.ts?test=${Date.now()}-${Math.random()}`);
}

describe("linked provider account auth snapshot", () => {
  it("detects reusable Codex auth from the local CLI store", async () => {
    const home = mkdtempSync(join(tmpdir(), "eliza-agent-codex-auth-"));
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex", "auth.json"),
      JSON.stringify({
        auth_mode: "chatgpt",
        last_refresh: "2026-03-21T12:00:00.000Z",
        tokens: {
          access_token: "access",
          refresh_token: "refresh",
        },
      }),
      "utf8",
    );

    const mod = await loadSnapshotModule();
    const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
    expect(snapshot.codex.reusable).toBe(true);
    expect(snapshot.codex.authMode).toBe("chatgpt");
    expect(snapshot.codex.source).toContain(".codex/auth.json");
  });

  it("detects reusable Claude Code oauth credentials", async () => {
    const home = mkdtempSync(join(tmpdir(), "eliza-agent-claude-auth-"));
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", ".credentials.json"),
      JSON.stringify({
        claudeAiOauth: {
          accessToken: "access",
          refreshToken: "refresh",
          expiresAt: 1_763_579_600_000,
        },
      }),
      "utf8",
    );
    writeFileSync(
      join(home, ".claude.json"),
      JSON.stringify({
        oauthAccount: {
          displayName: "Symbiotic Operator",
          emailAddress: "solsymbaiex@gmail.com",
        },
      }),
      "utf8",
    );

    const mod = await loadSnapshotModule();
    const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
    expect(snapshot.claudeCode.reusable).toBe(true);
    expect(snapshot.claudeCode.accountLabel).toContain("Symbiotic Operator");
    expect(snapshot.claudeCode.source).toContain(".claude/.credentials.json");
    expect(snapshot.claudeCode.loginCommand).toBe("claude auth login");
  });
});
