import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builtCliEntry,
  createTerminalProfile,
  destroyTerminalSession,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

function runPiped(
  args: string[],
  options: {
    input?: string;
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  return spawnSync(process.execPath, [builtCliEntry, ...args], {
    cwd: fixture.profile,
    env: {
      ...(fixture.environment as Record<string, string>),
      ...(options.env as Record<string, string> | undefined),
    },
    input: options.input,
    encoding: "utf8",
    timeout: options.timeoutMs ?? 20_000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

function parseJsonResult(stdout: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stdout) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Runtime-backed output currently embeds the document among log lines.
  }
  for (const line of stdout.split(/\r?\n/u).reverse()) {
    if (!line.trimStart().startsWith('{"ok"')) continue;
    const parsed = JSON.parse(line) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  throw new Error(`No one-shot JSON result found in stdout:\n${stdout}`);
}

function occurrences(text: string, needle: string): number {
  return needle ? text.split(needle).length - 1 : 0;
}

describe("built CLI error-channel hygiene", () => {
  it("keeps expected usage errors as exact single-line stderr without logger noise", () => {
    const unknownOption = runPiped(["exec", "--wat"]);
    expect(unknownOption.error).toBeUndefined();
    expect(unknownOption.status).toBe(1);
    expect(unknownOption.stdout).toBe("");
    expect(unknownOption.stderr).toBe("Unknown exec option: --wat.\n");

    const missingPrompt = runPiped(["exec"]);
    expect(missingPrompt.error).toBeUndefined();
    expect(missingPrompt.status).toBe(1);
    expect(missingPrompt.stdout).toBe("");
    expect(missingPrompt.stderr).toBe(
      'Usage: doolittle exec --prompt "your request" [--json]\n',
    );

    const invalidJobsAction = runPiped(["jobs", "wat"]);
    expect(invalidJobsAction.error).toBeUndefined();
    expect(invalidJobsAction.status).toBe(1);
    expect(invalidJobsAction.stdout).toBe("");
    expect(invalidJobsAction.stderr).toBe(
      "Usage: doolittle jobs <list|show|attach|cancel> [job-id]\n",
    );

    const missingJob = runPiped(["jobs", "show", "missing-job"]);
    expect(missingJob.error).toBeUndefined();
    expect(missingJob.status).toBe(1);
    expect(missingJob.stdout).toBe("");
    expect(missingJob.stderr).toBe("Background job not found: missing-job\n");
  });

  it("classifies interactive --prompt-stdin misuse as a clean usage error", async () => {
    terminal = spawnTerminalSession({
      argv: [builtCliEntry, "exec", "--prompt-stdin"],
      cols: 100,
      rows: 24,
      cwd: fixture.profile,
      env: fixture.environment,
    });
    const exitCode = await Promise.race([
      terminal.closed,
      new Promise<undefined>((done) =>
        setTimeout(() => done(undefined), 10_000),
      ),
    ]);

    expect(exitCode).toBe(1);
    const plain = stripVTControlCharacters(terminal.rawOutput).replaceAll(
      "\r\n",
      "\n",
    );
    expect(plain).toBe("--prompt-stdin requires non-interactive stdin.\n");
    expect(plain).not.toContain("entrypoint-main-failed");
    expect(plain).not.toContain("Error: --prompt-stdin");
  }, 30_000);

  it("does not leak terminal restoration bytes into piped startup errors", () => {
    const emptyState = resolve(fixture.profile, "empty-state");
    mkdirSync(emptyState);
    const result = runPiped(["exec", "-p", "hello"], {
      env: {
        HOME: emptyState,
        USERPROFILE: emptyState,
        DOOLITTLE_DATA_DIR: emptyState,
        ELIZA_HOME: emptyState,
        ELIZA_STATE_DIR: emptyState,
        ELIZA_CONFIG_PATH: resolve(emptyState, "eliza.json"),
      },
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("No onboarding state found.");
    expect(result.stderr).not.toContain("\x1b");
  });

  it("reports offline provider fallback as a failed one-shot result", () => {
    const result = runPiped(
      ["exec", "-p", "Say hello for the error hygiene audit.", "--json"],
      { timeoutMs: 60_000 },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    const document = parseJsonResult(result.stdout);
    expect(document).toMatchObject({
      ok: false,
      tone: "warning",
    });
    expect(String(document.text)).toContain("model provider is unavailable");

    const streamed = runPiped(
      ["exec", "-p", "Say hello for the streamed audit.", "--json-stream"],
      { timeoutMs: 60_000 },
    );
    expect(streamed.error).toBeUndefined();
    expect(streamed.status).toBe(1);
    const events = streamed.stdout
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('{"type"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events.find((event) => event.type === "result")).toMatchObject({
      tone: "warning",
    });
    expect(events.find((event) => event.type === "completed")).toMatchObject({
      status: "failed",
    });

    const staticHelp = runPiped(["exec", "-p", "/help", "--json"], {
      timeoutMs: 20_000,
    });
    expect(staticHelp.error).toBeUndefined();
    expect(staticHelp.status).toBe(0);
    expect(parseJsonResult(staticHelp.stdout)).toMatchObject({
      ok: true,
      tone: "info",
    });
  }, 120_000);

  it("renders the banner footer, preserves long shell tokens, and deduplicates lock failures", async () => {
    terminal = spawnTerminalSession({
      argv: [builtCliEntry],
      cols: 100,
      rows: 45,
      scrollback: 1000,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    await terminal.waitForGridText("terminalfixture@", 60_000);
    expect
      .soft(terminal.rawOutput)
      .toContain("terminal-first · cockpit optional");

    const longToken = "x".repeat(180);
    const spacedLine = `${"width adaptation probe with spaces ".repeat(6)}end`;
    terminal.type(
      `!python3 -c "print('${"x"}'*180); print(('width adaptation probe with spaces '*6)+'end')"\r`,
    );
    await terminal.waitForRaw(spacedLine, 30_000);
    expect.soft(terminal.rawOutput).toContain(longToken);
    expect.soft(terminal.rawOutput).not.toContain(`${"x".repeat(159)}…`);

    const locked = runPiped(["exec", "-p", "hello while the shell is open"], {
      timeoutMs: 45_000,
    });
    expect(locked.error).toBeUndefined();
    expect(locked.status).toBe(1);
    expect.soft(locked.stderr).not.toContain("\x1b");
    expect.soft(locked.stderr).not.toContain("entrypoint-main-failed");
    expect
      .soft(occurrences(locked.stderr, "PGlite data dir is already in use"))
      .toBe(1);

    terminal.type("exit\r");
    const exitCode = await Promise.race([
      terminal.closed,
      new Promise<undefined>((done) =>
        setTimeout(() => done(undefined), 20_000),
      ),
    ]);
    expect(exitCode).toBe(0);
  }, 120_000);
});
