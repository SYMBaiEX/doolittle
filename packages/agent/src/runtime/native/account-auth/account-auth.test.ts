import { describe, expect, it } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function loadSnapshotModule() {
  return import(`./index.ts?test=${Date.now()}-${Math.random()}`);
}

async function withIsolatedAuthStore<T>(
  fn: (paths: { dataDir: string }) => Promise<T> | T,
): Promise<T> {
  const previous = process.env.DOOLITTLE_DATA_DIR;
  const dataDir = mkdtempSync(join(tmpdir(), "doolittle-auth-store-"));
  process.env.DOOLITTLE_DATA_DIR = dataDir;
  try {
    return await fn({ dataDir });
  } finally {
    if (previous === undefined) {
      delete process.env.DOOLITTLE_DATA_DIR;
    } else {
      process.env.DOOLITTLE_DATA_DIR = previous;
    }
  }
}

describe("linked provider account auth snapshot", () => {
  it("detects reusable Codex auth from the local CLI store", async () => {
    await withIsolatedAuthStore(async () => {
      const home = mkdtempSync(join(tmpdir(), "doolittle-codex-auth-"));
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
      expect(snapshot.codex.nativeReady).toBe(true);
      expect(snapshot.codex.fallbackReady).toBe(false);
      expect(snapshot.codex.authMode).toBe("chatgpt");
      expect(snapshot.codex.source).toContain(".codex/auth.json");
      const advice = mod.getLinkedProviderConnectAdvice("codex", home);
      expect(advice.ready).toBe(true);
      expect(advice.preferredAction).toBe("use");
    });
  });

  it("detects reusable Claude Code oauth credentials", async () => {
    await withIsolatedAuthStore(async () => {
      const home = mkdtempSync(join(tmpdir(), "doolittle-claude-auth-"));
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
      expect(snapshot.claudeCode.nativeReady).toBe(true);
      expect(snapshot.claudeCode.accountLabel).toContain("Symbiotic Operator");
      expect(snapshot.claudeCode.source).toContain(".claude/.credentials.json");
      expect(snapshot.claudeCode.loginCommand).toBe("claude auth login");
      expect(snapshot.claudeCode.setupCommand).toBe("claude setup-token");
    });
  });

  it("detects reusable Claude Code setup-token from env", async () => {
    const previous = process.env.CLAUDE_CODE_SETUP_TOKEN;
    process.env.CLAUDE_CODE_SETUP_TOKEN = "sk-ant-oat01-test";
    try {
      await withIsolatedAuthStore(async () => {
        const home = mkdtempSync(join(tmpdir(), "doolittle-claude-token-"));
        const mod = await loadSnapshotModule();
        const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
        expect(snapshot.claudeCode.reusable).toBe(true);
        expect(snapshot.claudeCode.nativeReady).toBe(true);
        expect(snapshot.claudeCode.authMode).toBe("setup-token");
        expect(snapshot.claudeCode.source).toBe("env:CLAUDE_CODE_SETUP_TOKEN");

        const credentials = mod.getLinkedClaudeCodeCredentials(home);
        expect(credentials?.accessToken).toBe("sk-ant-oat01-test");
        expect(credentials?.authMode).toBe("setup-token");
      });
    } finally {
      if (previous === undefined) {
        delete process.env.CLAUDE_CODE_SETUP_TOKEN;
      } else {
        process.env.CLAUDE_CODE_SETUP_TOKEN = previous;
      }
    }
  });

  it("treats local logged-in Claude CLI without native creds as fallback-only", async () => {
    await withIsolatedAuthStore(async () => {
      const home = mkdtempSync(join(tmpdir(), "doolittle-claude-fallback-"));
      writeFileSync(
        join(home, ".claude.json"),
        JSON.stringify({
          oauthAccount: {
            displayName: "Operator",
            emailAddress: "operator@example.com",
          },
        }),
        "utf8",
      );

      const originalPath = process.env.PATH;
      const binDir = join(home, "bin");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(
        join(binDir, "claude"),
        `#!/bin/sh
if [ "$1" = "auth" ] && [ "$2" = "status" ] && [ "$3" = "--json" ]; then
  printf '{"loggedIn":true,"authMethod":"claude.ai","apiProvider":"firstParty"}'
  exit 0
fi
if [ "$1" = "--version" ]; then
  printf '2.1.74'
  exit 0
fi
exit 0
`,
        "utf8",
      );
      chmodSync(join(binDir, "claude"), 0o755);
      process.env.PATH = `${binDir}:${originalPath ?? ""}`;

      try {
        const mod = await loadSnapshotModule();
        const snapshot = mod.getLinkedProviderAccountsSnapshot(home);
        expect(snapshot.claudeCode.reusable).toBe(true);
        expect(snapshot.claudeCode.nativeReady).toBe(false);
        expect(snapshot.claudeCode.fallbackReady).toBe(true);

        const advice = mod.getLinkedProviderConnectAdvice("claude-code", home);
        expect(advice.ready).toBe(false);
        expect(advice.preferredAction).toBe("setup-token");
        expect(advice.primaryCommand).toBe("claude setup-token");
      } finally {
        process.env.PATH = originalPath;
      }
    });
  });

  it("canonicalizes Eliza Cloud base URL from env credentials", async () => {
    const previousKey = process.env.ELIZAOS_CLOUD_API_KEY;
    const previousBaseUrl = process.env.ELIZAOS_CLOUD_BASE_URL;
    process.env.ELIZAOS_CLOUD_API_KEY = "cloud-test-key";
    process.env.ELIZAOS_CLOUD_BASE_URL = "https://elizacloud.ai/api/v1/";
    try {
      await withIsolatedAuthStore(async () => {
        const mod = await loadSnapshotModule();
        const credentials = mod.getLinkedElizaCloudCredentials();
        expect(credentials?.apiKey).toBe("cloud-test-key");
        expect(credentials?.baseUrl).toBe("https://www.elizacloud.ai/api/v1");
      });
    } finally {
      if (previousKey === undefined) {
        delete process.env.ELIZAOS_CLOUD_API_KEY;
      } else {
        process.env.ELIZAOS_CLOUD_API_KEY = previousKey;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.ELIZAOS_CLOUD_BASE_URL;
      } else {
        process.env.ELIZAOS_CLOUD_BASE_URL = previousBaseUrl;
      }
    }
  });
});
