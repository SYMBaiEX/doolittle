import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { type IPty, spawn } from "@lydell/node-pty";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import cliManifest from "../../apps/cli/package.json" with { type: "json" };
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const entry = resolve(import.meta.dirname, "../../apps/cli/dist/index.js");
const cockpitMarkers = [
  "cockpit for observability",
  "Conversation",
  "Status",
  "Activity",
  "Input",
];
const plainShellMarkers = [
  "TUI failed to start",
  "Falling back to plain CLI",
  "terminal-first · cockpit optional",
  "Talk naturally for paired work",
  'Use "doolittle cockpit" when you want the fullscreen operator deck.',
];

let profile: string;
let environment: NodeJS.ProcessEnv;
let terminal: IPty | undefined;
let terminalClosed: Promise<number> | undefined;

beforeEach(() => {
  profile = mkdtempSync(resolve(tmpdir(), "doolittle-cockpit-acceptance-"));
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

async function waitForCockpitBoot(input: {
  output: () => string;
  exitCode: () => number | undefined;
}): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const output = input.output();
    const fallbackMarker = plainShellMarkers.find((marker) =>
      output.includes(marker),
    );
    if (fallbackMarker) {
      throw new Error(
        `Dist cockpit boot fell back to the plain shell (${fallbackMarker}).\n${output.slice(-4000)}`,
      );
    }
    if (cockpitMarkers.every((marker) => output.includes(marker))) {
      return output;
    }
    const exitCode = input.exitCode();
    if (exitCode !== undefined) {
      throw new Error(
        `Dist cockpit exited before rendering cockpit chrome (${exitCode}).\n${output.slice(-4000)}`,
      );
    }
    await new Promise<void>((done) => setTimeout(done, 50));
  }
  throw new Error(
    `Dist cockpit did not render cockpit chrome.\n${input.output().slice(-4000)}`,
  );
}

describe("built CLI cockpit acceptance", () => {
  it("boots cockpit chrome from the dist bundle without the plain-shell fallback", async () => {
    const pty = spawn(process.execPath, [entry, "--cli"], {
      name: "xterm-256color",
      cols: 120,
      rows: 32,
      cwd: profile,
      env: environment as Record<string, string>,
    });
    terminal = pty;
    let output = "";
    let exitCode: number | undefined;
    const closed = new Promise<number>((done) =>
      pty.onExit(({ exitCode: code }) => {
        exitCode = code;
        done(code);
      }),
    );
    terminalClosed = closed;
    pty.onData((chunk) => {
      output += chunk;
    });

    const bootTranscript = await waitForCockpitBoot({
      output: () => output,
      exitCode: () => exitCode,
    });
    for (const marker of cockpitMarkers) {
      expect(bootTranscript).toContain(marker);
    }
    for (const marker of plainShellMarkers) {
      expect(bootTranscript).not.toContain(marker);
    }

    pty.write("\x11");
    const timeout = setTimeout(() => pty.kill(), 15_000);
    try {
      expect(await closed).toBe(0);
    } finally {
      clearTimeout(timeout);
    }
    expect(exitCode).toBe(0);
  }, 60_000);
});
