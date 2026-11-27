import { spawn } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  builtCliEntry,
  createTerminalProfile,
  destroyTerminalSession,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

interface CliRunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runBuiltCli(
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    input?: string;
    timeoutMs?: number;
  },
): Promise<CliRunResult> {
  const timeoutMs = options.timeoutMs ?? 45_000;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [builtCliEntry, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    if (!child.stdout || !child.stderr) {
      clearTimeout(timer);
      reject(new Error("Built CLI child did not expose output pipes."));
      return;
    }
    const childStdout = child.stdout;
    const childStderr = child.stderr;
    childStdout.setEncoding("utf8");
    childStderr.setEncoding("utf8");
    childStdout.on("data", (chunk) => {
      stdout += chunk;
    });
    childStderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
    if (options.input !== undefined) {
      if (!child.stdin) {
        clearTimeout(timer);
        reject(new Error("Built CLI child did not expose an input pipe."));
        return;
      }
      child.stdin.end(options.input);
    }
  });
}

function parseJsonLines(stdout: string): unknown[] {
  return stdout
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

describe("built CLI output channel ownership", () => {
  it("keeps runtime-backed --json-stream stdout valid NDJSON end to end", async () => {
    const result = await runBuiltCli(
      ["exec", "-p", "/status", "--json-stream"],
      {
        cwd: fixture.profile,
        env: fixture.environment,
        timeoutMs: 60_000,
      },
    );

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(0);
    const events = parseJsonLines(result.stdout) as Array<{ type?: string }>;
    expect(events[0]?.type).toBe("start");
    expect(events.at(-1)?.type).toBe("completed");
  }, 75_000);

  it("keeps runtime-backed --json stdout parseable as one JSON document", async () => {
    const result = await runBuiltCli(["exec", "-p", "/status", "--json"], {
      cwd: fixture.profile,
      env: fixture.environment,
      timeoutMs: 60_000,
    });

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      text: expect.any(String),
    });
  }, 75_000);

  it("keeps runtime-backed piped shell stdout limited to the response", async () => {
    const result = await runBuiltCli([], {
      cwd: fixture.profile,
      env: fixture.environment,
      input: "Say hello for output ownership.\n",
      timeoutMs: 60_000,
    });

    expect(result.timedOut).toBe(false);
    // Failure diagnostics travel with the assertion: piped-shell behavior
    // diverges across platforms and CI evidence is otherwise invisible.
    // Exit 1 is deliberate: the offline-bootstrap fallback is marked a failed
    // execution so automation never mistakes provider degradation for success
    // (round-20 error hygiene). This test owns channel separation, not the
    // exit policy — stdout carries the response, stderr the warnings.
    expect(
      result.code,
      `exit code (stderr tail: ${JSON.stringify(result.stderr.slice(-2000))}; stdout tail: ${JSON.stringify(result.stdout.slice(-400))})`,
    ).toBe(1);
    expect(result.stdout).toContain("model provider is unavailable");
    expect(result.stdout).not.toContain("[codex-cli] initialized");
    expect(result.stdout).not.toMatch(/(?:^|\n)\s*(?:Info|Warn)\s/u);
  }, 75_000);

  it("keeps the static /help json-stream fast path valid", async () => {
    const result = await runBuiltCli(["exec", "-p", "/help", "--json-stream"], {
      cwd: fixture.profile,
      env: fixture.environment,
      timeoutMs: 15_000,
    });

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");
    const events = parseJsonLines(result.stdout) as Array<{ type?: string }>;
    expect(events.map((event) => event.type)).toEqual([
      "start",
      "result",
      "completed",
    ]);
  }, 30_000);

  it("exits the no-surface empty-stdin path within a bounded time", async () => {
    const result = await runBuiltCli([], {
      cwd: fixture.profile,
      env: fixture.environment,
      timeoutMs: 15_000,
    });

    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("no active shell or API surface");
  }, 30_000);

  it("keeps the interactive plain banner, hints, prompt, and echo clear of boot log flood", async () => {
    terminal = spawnTerminalSession({
      argv: [builtCliEntry],
      cols: 110,
      rows: 36,
      cwd: fixture.profile,
      env: fixture.environment,
    });

    await terminal.waitForGridText("conversation shell");
    await terminal.waitForGridText("Talk naturally for paired work");
    const initialGrid = await terminal.gridText();
    expect(initialGrid).not.toContain("[boot] boot info");
    expect(initialGrid).not.toContain("[codex-cli] initialized");

    terminal.type("/help");
    await terminal.waitForRaw("/help");
    terminal.key("enter");
    await terminal.waitForRaw("operator shell");
    expect(terminal.rawOutput).not.toContain("[boot] boot info");
    expect(terminal.rawOutput).not.toContain("Initializing MCP plugin");

    terminal.type("exit");
    terminal.key("enter");
    const exitCode = await Promise.race([
      terminal.closed,
      new Promise<undefined>((done) =>
        setTimeout(() => done(undefined), 15_000),
      ),
    ]);
    expect(exitCode).toBe(0);
    expect(terminal.rawOutput).not.toContain("[CloudBridge] Service stopped");
    expect(terminal.rawOutput).not.toContain("[SetupService] Stopping");
  }, 90_000);
});
