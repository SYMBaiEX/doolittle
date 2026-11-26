import { execFile } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import cliManifest from "../../apps/cli/package.json" with { type: "json" };
import {
  builtCliEntry,
  createTerminalProfile,
  destroyTerminalSession,
  spawnTerminalSession,
  type TerminalProfile,
  type TerminalSession,
} from "../support/terminal-pty";

const execute = promisify(execFile);
const entry = builtCliEntry;
let fixture: TerminalProfile;
let terminal: TerminalSession | undefined;

beforeEach(() => {
  fixture = createTerminalProfile();
});

afterEach(async () => {
  await destroyTerminalSession(terminal, fixture);
  terminal = undefined;
});

describe("built CLI product acceptance", () => {
  it("starts help, version and JSON commands from outside the repository", async () => {
    const { profile, environment } = fixture;
    const options = { cwd: profile, env: environment, timeout: 15_000 };
    const initialData = readdirSync(resolve(profile, "data")).sort();
    const version = await execute(process.execPath, [entry, "--version"], {
      ...options,
      env: { ...environment, DOOLITTLE_REPO_ROOT: undefined },
    });
    expect(version.stdout.trim()).toBe(`Doolittle ${cliManifest.version}`);
    expect(version.stderr).toBe("");
    const help = await execute(process.execPath, [entry, "--help"], options);
    expect(help.stdout).toContain("doolittle cockpit");
    expect(help.stdout).toContain("doolittle desktop");
    expect(help.stderr).toBe("");
    const commands = await execute(
      process.execPath,
      [entry, "commands", "theme list"],
      options,
    );
    expect(commands.stdout).toContain("/theme list");
    expect(commands.stderr).toBe("");
    expect(readdirSync(resolve(profile, "data")).sort()).toEqual(initialData);
    const result = await execute(
      process.execPath,
      [entry, "exec", "-p", "/help", "--json"],
      options,
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      text: expect.stringContaining("operator shell"),
    });
    await expect(
      execute(process.execPath, [entry, "exec"], options),
    ).rejects.toMatchObject({
      code: 1,
      stdout: "",
      stderr: expect.stringContaining("Usage: doolittle exec --prompt"),
    });
  }, 45_000);

  it("runs an interactive terminal conversation, preserves session commands and exits cleanly", async () => {
    terminal = spawnTerminalSession({
      argv: [entry],
      cols: 110,
      rows: 32,
      cwd: fixture.profile,
      env: fixture.environment,
    });
    await terminal.waitForRaw("Talk naturally for paired work");
    terminal.type("/help\r");
    await terminal.waitForRaw("operator shell");
    terminal.type("/title terminal-acceptance\r");
    await terminal.waitForRaw("terminal-acceptance");
    terminal.type("Say hello for terminal acceptance.\r");
    // The real offline SDK path must report provider unavailability, not invent a reply.
    await terminal.waitForRaw("model provider is unavailable");
    expect(terminal.rawOutput).not.toContain("Your message is still here");
    expect(terminal.rawOutput).not.toContain("API listening");
    terminal.type("exit\r");
    // Bounded wait: a wedged child fails fast here, and afterEach teardown
    // still kills the PTY rather than hanging the worker.
    const exitCode = await Promise.race([
      terminal.closed,
      new Promise<undefined>((done) =>
        setTimeout(() => done(undefined), 20_000),
      ),
    ]);
    expect(exitCode).toBe(0);
    expect(terminal.exitCode).toBe(0);
  }, 90_000);
});
