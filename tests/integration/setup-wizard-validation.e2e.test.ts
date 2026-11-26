import { execFile } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  resolveNubExecutable,
  spawnTerminalSession,
  type TerminalSession,
} from "../support/terminal-pty";

const bootstrapEntry = fileURLToPath(
  new URL("../../scripts/bootstrap.ts", import.meta.url),
);
const execute = promisify(execFile);

interface WizardFixture {
  root: string;
  home: string;
  data: string;
  environment: NodeJS.ProcessEnv;
  cleanup: () => void;
}

const EMPTY_CREDENTIAL_KEYS = [
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_SETUP_TOKEN",
  "DISCORD_BOT_TOKEN",
  "E2B_API_KEY",
  "ELIZAOS_CLOUD_API_KEY",
  "ELIZAOS_CLOUD_EMBEDDING_API_KEY",
  "FAL_API_KEY",
  "GH_TOKEN",
  "GITHUB_TOKEN",
  "HOMEASSISTANT_TOKEN",
  "HOMEASSISTANT_URL",
  "MATTERMOST_TOKEN",
  "MATTERMOST_URL",
  "MATRIX_ACCESS_TOKEN",
  "MATRIX_HOMESERVER",
  "NODE_AUTH_TOKEN",
  "NPM_TOKEN",
  "OPENAI_API_KEY",
  "SIGNAL_ACCOUNT_NUMBER",
  "SIGNAL_CLI_COMMAND",
  "SIGNAL_CLI_PATH",
  "SIGNAL_HTTP_URL",
  "SLACK_APP_TOKEN",
  "SLACK_BOT_TOKEN",
  "SLACK_SIGNING_SECRET",
  "SLACK_USER_TOKEN",
  "SLACK_WEBHOOK_URL",
  "TELEGRAM_BOT_TOKEN",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_VERIFY_TOKEN",
] as const;

function createWizardFixture(
  options: { extraEnvLines?: string[] } = {},
): WizardFixture {
  const root = mkdtempSync(join(tmpdir(), "doolittle-r19-validation-"));
  const home = join(root, "home");
  const data = join(root, "data");
  mkdirSync(home, { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    `${JSON.stringify({ name: "doolittle", version: "0.1.0" })}\n`,
  );
  const envLines = [
    "DOOLITTLE_NAME=ValidationBot",
    "DOOLITTLE_MODE=cli",
    `DOOLITTLE_DATA_DIR=${data}`,
    `DOOLITTLE_WORKSPACE_DIR=${root}`,
    "DOOLITTLE_TIMEZONE=America/Chicago",
    "DOOLITTLE_USE_LINKED_CODEX_AUTH=false",
    "DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH=false",
    "DOOLITTLE_CLAUDE_CODE_CLI_FALLBACK=false",
    "DOOLITTLE_OFFLINE_BOOTSTRAP=true",
    "DOOLITTLE_EXECUTION_BACKEND=local",
    "DOOLITTLE_BROWSER_PROVIDER=basic",
    "DOOLITTLE_RUN_DEPTH=standard",
    "DOOLITTLE_TOOL_PROGRESS=new",
    "DOOLITTLE_ALLOW_ALL_USERS=false",
    "DOOLITTLE_PAIRING_MODE=pair",
    "OPENAI_API_KEY=",
    "ANTHROPIC_API_KEY=",
    "ELIZAOS_CLOUD_API_KEY=",
    "CLAUDE_CODE_OAUTH_TOKEN=",
    "CLAUDE_CODE_SETUP_TOKEN=",
    "FAL_API_KEY=",
    "E2B_API_KEY=",
    "GITHUB_TOKEN=",
    ...(options.extraEnvLines ?? []),
    "",
  ];
  writeFileSync(join(root, ".env"), envLines.join("\n"), { mode: 0o600 });
  writeFileSync(join(root, ".env.example"), envLines.join("\n"), {
    mode: 0o600,
  });

  const environment: NodeJS.ProcessEnv = {
    PATH: [dirname(process.execPath), "/usr/bin", "/bin", "/usr/sbin", "/sbin"]
      .filter(Boolean)
      .join(delimiter),
    HOME: home,
    USERPROFILE: home,
    TERM: "xterm-256color",
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    TMPDIR: tmpdir(),
    DOOLITTLE_REPO_ROOT: root,
    DOOLITTLE_WORKSPACE_DIR: root,
    DOOLITTLE_DATA_DIR: data,
    DOOLITTLE_MODE: "cli",
    DOOLITTLE_OFFLINE_BOOTSTRAP: "true",
    DOOLITTLE_USE_LINKED_CODEX_AUTH: "false",
    DOOLITTLE_USE_LINKED_CLAUDE_CODE_AUTH: "false",
    ELIZA_HOME: data,
    ELIZA_STATE_DIR: data,
    ELIZA_VAULT_DISABLE_KEYCHAIN: "1",
    ELIZA_CONFIG_PATH: join(data, "eliza.json"),
    ELIZA_ACP_STATE_DIR: join(data, "plugin-acp"),
    ELIZA_ACCOUNT_POOL_KEEPALIVE: "false",
    ...Object.fromEntries(EMPTY_CREDENTIAL_KEYS.map((key) => [key, ""])),
  };

  let cleaned = false;
  return {
    root,
    home,
    data,
    environment,
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      rmSync(root, { recursive: true, force: true });
    },
  };
}

let fixture: WizardFixture | undefined;
let terminal: TerminalSession | undefined;

afterEach(async () => {
  if (terminal) {
    await terminal.close(5_000);
  }
  terminal = undefined;
  fixture?.cleanup();
  fixture = undefined;
});

function spawnWizard(): TerminalSession {
  fixture = createWizardFixture();
  terminal = spawnTerminalSession({
    command: resolveNubExecutable(),
    argv: [bootstrapEntry],
    cwd: fixture.root,
    env: fixture.environment,
    cols: 110,
    rows: 30,
  });
  return terminal;
}

async function waitForExitCode(
  session: TerminalSession,
  timeoutMs: number,
): Promise<number | undefined> {
  return Promise.race([
    session.closed,
    new Promise<undefined>((done) =>
      setTimeout(() => done(undefined), timeoutMs),
    ),
  ]);
}

async function reachOfflineReview(session: TerminalSession): Promise<void> {
  await session.waitForGridText("Choose my first form", 15_000);
  session.key("up"); // Quick ignition
  session.key("enter");
  await session.waitForGridText("What should I answer to", 5_000);
  session.key("enter");
  await session.waitForGridText("What timezone should shape my days", 5_000);
  session.key("enter");
  await session.waitForGridText("Choose the face I wake up in", 5_000);
  session.key("enter");
  await session.waitForGridText("How should I think on day one", 5_000);
  session.type("8"); // Dormant core / offline
  session.key("enter");
  await session.waitForGridText("How far should I run before I stop", 5_000);
  session.key("enter");
  await session.waitForGridText("How much tool activity should I show", 5_000);
  session.key("enter");
  await session.waitForGridText("Should I seal this configuration", 10_000);
}

describe("setup wizard validation and completion metadata", () => {
  it("rejects an invalid IANA timezone, re-prompts, and persists only the corrected value", async () => {
    const session = spawnWizard();
    await session.waitForGridText("Choose my first form", 15_000);
    session.key("up");
    session.key("enter");
    await session.waitForGridText("What should I answer to", 5_000);
    session.key("enter");
    await session.waitForGridText("What timezone should shape my days", 5_000);

    for (let index = 0; index < 32; index += 1) {
      session.key("backspace");
    }
    session.type("not/a-real-timezone");
    session.key("enter");

    await session.waitForGridText("valid IANA timezone", 5_000);
    const rejectedGrid = await session.gridText();
    expect(rejectedGrid).toContain("What timezone should shape my days");
    expect(rejectedGrid).not.toContain("Choose the face I wake up in");

    for (let index = 0; index < 32; index += 1) {
      session.key("backspace");
    }
    session.type("Europe/Berlin");
    session.key("enter");
    await session.waitForGridText("Choose the face I wake up in", 5_000);
    session.key("enter");
    await session.waitForGridText("How should I think on day one", 5_000);
    session.type("8");
    session.key("enter");
    await session.waitForGridText("How far should I run before I stop", 5_000);
    session.key("enter");
    await session.waitForGridText(
      "How much tool activity should I show",
      5_000,
    );
    session.key("enter");
    await session.waitForGridText("Should I seal this configuration", 10_000);
    session.key("enter");
    expect(await waitForExitCode(session, 10_000)).toBe(0);

    if (!fixture) {
      throw new Error("wizard fixture missing after completion");
    }
    const writtenEnv = readFileSync(join(fixture.root, ".env"), "utf8");
    expect(writtenEnv).toContain("DOOLITTLE_TIMEZONE=Europe/Berlin");
    expect(writtenEnv).not.toContain("not/a-real-timezone");
  }, 30_000);

  it("marks Review as the current stage in the Ritual Stages sidebar", async () => {
    const session = spawnWizard();
    await reachOfflineReview(session);

    const lines = await session.gridLines();
    expect(lines.some((line) => line.includes("› Review"))).toBe(true);
  }, 30_000);

  it("writes coherent offline onboarding metadata in a subprocess completion", async () => {
    fixture = createWizardFixture({
      // A legacy Devin-only fixture is the supported headless path that
      // resolves to the dormant/offline provider without inventing credentials.
      extraEnvLines: ["DOOLITTLE_USE_LINKED_DEVIN_AUTH=true"],
    });

    const result = await execute(
      resolveNubExecutable(),
      [bootstrapEntry, "--headless"],
      {
        cwd: fixture.root,
        env: fixture.environment,
        timeout: 15_000,
      },
    );
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("mind: offline");
    expect(result.stdout).toContain("native connection: missing");

    const settings = JSON.parse(
      readFileSync(join(fixture.data, "settings.json"), "utf8"),
    ) as {
      model: { provider: string; model: string; baseUrl: string };
    };
    expect(settings.model).toMatchObject({
      provider: "offline",
      model: "offline",
      baseUrl: "",
    });

    const onboarding = JSON.parse(
      readFileSync(join(fixture.data, "onboarding.json"), "utf8"),
    ) as {
      provider: string;
      nativeConnection: {
        kind: string;
        provider: string | null;
        detail: string;
      };
    };
    expect(onboarding.provider).toBe("offline");
    expect(onboarding.nativeConnection.kind).toBe("missing");
    expect(onboarding.nativeConnection.provider).toBeNull();
    expect(onboarding.nativeConnection.detail.toLowerCase()).toContain(
      "offline",
    );
    expect(onboarding.nativeConnection.detail).not.toContain("Ollama");
  }, 30_000);
});
