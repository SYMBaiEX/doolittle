import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { type IPty, spawn } from "@lydell/node-pty";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import cliManifest from "../../apps/cli/package.json" with { type: "json" };
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const execute = promisify(execFile);
const entry = resolve(import.meta.dirname, "../../apps/cli/dist/index.js");
let profile: string;
let environment: NodeJS.ProcessEnv;
let terminal: IPty | undefined;
let terminalClosed: Promise<number> | undefined;
beforeEach(() => {
  profile = mkdtempSync(resolve(tmpdir(), "doolittle-cli-acceptance-"));
  writeFileSync(
    resolve(profile, "package.json"),
    JSON.stringify({ name: "doolittle", version: cliManifest.version }),
  );
  const data = resolve(profile, "data");
  mkdirSync(data);
  writeFileSync(resolve(data, "onboarding.json"), "{}\n");
  writeFileSync(
    resolve(data, "settings.json"),
    JSON.stringify({
      model: {
        provider: "offline",
        model: "offline",
        baseUrl: "",
        temperature: 0,
        maxTokens: 512,
      },
    }),
  );
  environment = {
    ...isolatedRuntimeEnvironment(data),
    // No repository .env, real home or linked accounts enter terminal acceptance.
    DOOLITTLE_REPO_ROOT: profile,
    DOOLITTLE_WORKSPACE_DIR: profile,
    DOOLITTLE_MODE: "cli",
    DOOLITTLE_NAME: "TerminalFixture",
  };
});
afterEach(async () => {
  if (terminal && terminalClosed) {
    terminal.kill();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        terminalClosed,
        new Promise<never>((_done, fail) => {
          timer = setTimeout(
            () =>
              fail(
                new Error(
                  `Terminal did not stop; profile retained at ${profile}`,
                ),
              ),
            10_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      terminal = undefined;
      terminalClosed = undefined;
    }
  }
  rmSync(profile, { recursive: true, force: true });
});

describe("built CLI product acceptance", () => {
  it("starts help, version and JSON commands from outside the repository", async () => {
    const options = { cwd: profile, env: environment, timeout: 15_000 };
    const version = await execute(process.execPath, [entry, "--version"], {
      ...options,
      env: { ...environment, DOOLITTLE_REPO_ROOT: undefined },
    });
    expect(version.stdout.trim()).toBe(`Doolittle ${cliManifest.version}`);
    const help = await execute(process.execPath, [entry, "--help"], options);
    expect(help.stdout).toContain("doolittle cockpit");
    expect(help.stdout).toContain("doolittle desktop");
    const result = await execute(
      process.execPath,
      [entry, "exec", "-p", "/help", "--json"],
      options,
    );
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: true,
      text: expect.stringContaining("operator shell"),
    });
  }, 45_000);

  it("runs an interactive terminal conversation, preserves session commands and exits cleanly", async () => {
    terminal = spawn(process.execPath, [entry], {
      name: "xterm-256color",
      cols: 110,
      rows: 32,
      cwd: profile,
      env: environment as Record<string, string>,
    });
    let output = "";
    const pending = new Set<() => void>();
    let exited: number | undefined;
    const closed = new Promise<number>((done) =>
      terminal?.onExit(({ exitCode }) => {
        exited = exitCode;
        done(exitCode);
      }),
    );
    terminalClosed = closed;
    terminal.onData((chunk) => {
      output += chunk;
      for (const check of pending) check();
    });
    const waitFor = (text: string) =>
      new Promise<void>((done, fail) => {
        const timer = setTimeout(() => {
          pending.delete(check);
          fail(
            new Error(
              `Terminal did not show ${JSON.stringify(text)}.\n${output.slice(-4000)}`,
            ),
          );
        }, 30_000);
        const check = () => {
          if (output.includes(text)) {
            clearTimeout(timer);
            pending.delete(check);
            done();
          }
        };
        pending.add(check);
        check();
      });
    await waitFor("Talk naturally for paired work");
    terminal.write("/help\r");
    await waitFor("operator shell");
    terminal.write("/title terminal-acceptance\r");
    await waitFor("terminal-acceptance");
    terminal.write("Say hello for terminal acceptance.\r");
    // The real offline SDK path must report provider unavailability, not invent a reply.
    await waitFor("model provider is unavailable");
    expect(output).not.toContain("Your message is still here");
    expect(output).not.toContain("API listening");
    terminal.write("exit\r");
    const timeout = setTimeout(() => terminal?.kill(), 15_000);
    try {
      expect(await closed).toBe(0);
    } finally {
      clearTimeout(timeout);
    }
    expect(exited).toBe(0);
  }, 90_000);
});
