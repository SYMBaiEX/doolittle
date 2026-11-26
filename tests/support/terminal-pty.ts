import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type IPty, spawn } from "@lydell/node-pty";
// Default import: @xterm/headless ships a minified CommonJS bundle whose
// named exports cjs-module-lexer cannot detect, so `import { Terminal }`
// fails under native ESM (vitest interop masks that). The default import is
// the module namespace in every runtime.
import xtermHeadless from "@xterm/headless";
import cliManifest from "../../apps/cli/package.json" with { type: "json" };
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

const { Terminal } = xtermHeadless;

const repoRoot = realpathSync(
  fileURLToPath(new URL("../../", import.meta.url)),
);

/** Built CLI entrypoint — the integration lane exercises shipped artifacts. */
export const builtCliEntry = resolve(repoRoot, "apps/cli/dist/index.js");

/** Source CLI entrypoint, used only where the bundled artifact cannot boot. */
export const sourceCliEntry = resolve(repoRoot, "apps/cli/src/index.ts");

export function resolveNubExecutable(): string {
  if (process.env.DOOLITTLE_NUB_PATH) return process.env.DOOLITTLE_NUB_PATH;
  const executable = process.platform === "win32" ? "nub.exe" : "nub";
  return resolve(repoRoot, "node_modules", ".bin", executable);
}

export interface TerminalProfile {
  /** Fake repository root the child process treats as its project. */
  profile: string;
  /** Private HOME / data directory seeded for fully offline boot. */
  data: string;
  /** Isolated offline environment for the child process. */
  environment: NodeJS.ProcessEnv;
  /** Remove the profile tree; safe to call more than once. */
  cleanup: () => void;
}

/**
 * Create the isolated offline fixture every terminal acceptance test starts
 * from: a private HOME with a fixture vault, no host credentials, and a
 * settings.json pinned to the offline provider so the real runtime boots
 * without network access.
 */
export function createTerminalProfile(): TerminalProfile {
  const profile = mkdtempSync(resolve(tmpdir(), "doolittle-cli-acceptance-"));
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
  const environment: NodeJS.ProcessEnv = {
    ...isolatedRuntimeEnvironment(data),
    // No repository .env, real home or linked accounts enter terminal acceptance.
    DOOLITTLE_REPO_ROOT: profile,
    DOOLITTLE_WORKSPACE_DIR: profile,
    DOOLITTLE_MODE: "cli",
    DOOLITTLE_NAME: "TerminalFixture",
  };
  let removed = false;
  return {
    profile,
    data,
    environment,
    cleanup: () => {
      if (removed) return;
      removed = true;
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

export interface SpawnTerminalOptions {
  /** Executable; defaults to the Node running the tests. */
  command?: string;
  argv?: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  scrollback?: number;
}

export interface TerminalCellSnapshot {
  chars: string;
  fg: number;
  bg: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
}

export interface TerminalSession {
  /** Raw output bytes accumulated since spawn (ANSI sequences intact). */
  readonly rawOutput: string;
  /** Resolves with the exit code once the child exits. */
  readonly closed: Promise<number>;
  /** Exit code if the child has exited, otherwise undefined. */
  readonly exitCode: number | undefined;
  /** Wait until the raw output stream contains `text`. */
  waitForRaw(text: string, timeoutMs?: number): Promise<void>;
  /** Wait until the rendered grid (ANSI-decoded viewport) contains `text`. */
  waitForGridText(text: string, timeoutMs?: number): Promise<void>;
  /**
   * Rendered viewport rows, top to bottom, right-trimmed. Awaits the xterm
   * write queue first, so the grid reflects every chunk received so far.
   */
  gridLines(): Promise<string[]>;
  /** Rendered viewport joined as a single string. */
  gridText(): Promise<string>;
  /**
   * Read a single cell's text and attributes after flushing pending output.
   * Coordinates are viewport-relative, zero-based. Intended for future
   * color/contrast assertions.
   */
  cellAt(column: number, row: number): Promise<TerminalCellSnapshot | null>;
  /**
   * Send text as real keystroke bytes. Does not append Enter; combine with
   * `key("enter")` or include "\r" explicitly.
   */
  type(text: string): void;
  /** Send a named special key as a real keystroke. */
  key(key: TerminalKey): void;
  /** Resize the PTY and the decoding grid together. */
  resize(cols: number, rows: number): void;
  /**
   * Kill the child if still running and wait (bounded) for exit.
   * Returns the exit code, or undefined when the wait timed out.
   */
  close(timeoutMs?: number): Promise<number | undefined>;
}

export type TerminalKey =
  | "enter"
  | "escape"
  | "backspace"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right"
  | "ctrl-c"
  | "ctrl-d"
  | "ctrl-e"
  | "ctrl-p";

const KEY_SEQUENCES: Record<TerminalKey, string> = {
  enter: "\r",
  escape: "\x1b",
  backspace: "\x7f",
  tab: "\t",
  up: "\x1b[A",
  down: "\x1b[B",
  left: "\x1b[D",
  right: "\x1b[C",
  "ctrl-c": "\x03",
  "ctrl-d": "\x04",
  "ctrl-e": "\x05",
  "ctrl-p": "\x10",
};

const DEFAULT_TIMEOUT_MS = 30_000;
const GRID_POLL_MS = 50;

/**
 * Spawn a CLI process inside a real PTY and decode its output continuously
 * into a headless xterm grid. All output chunks feed the decoder as they
 * arrive, so `gridLines()` reflects the rendered screen — not raw bytes —
 * at any moment.
 */
export function spawnTerminalSession(
  options: SpawnTerminalOptions,
): TerminalSession {
  const cols = options.cols ?? 110;
  let rows = options.rows ?? 32;
  const terminal: IPty = spawn(
    options.command ?? process.execPath,
    options.argv ?? [],
    {
      name: "xterm-256color",
      cols,
      rows,
      cwd: options.cwd,
      env: {
        ...(options.env as Record<string, string>),
        // Terminal behavior is locale-sensitive: blessed and unicode width
        // measurement degrade in POSIX/C locales, so pin a UTF-8 locale for
        // deterministic rendering across hosts (CI runners default to POSIX).
        // These pins intentionally WIN over the passed environment — host
        // locale must never leak into spawned terminal sessions.
        LC_ALL: "C.UTF-8",
        LANG: "C.UTF-8",
      },
    },
  );
  const xterm = new Terminal({
    cols,
    rows,
    scrollback: options.scrollback ?? 500,
    allowProposedApi: true,
  });

  let output = "";
  let exitCode: number | undefined;
  const rawWatchers = new Set<() => void>();
  const closed = new Promise<number>((done) =>
    terminal.onExit(({ exitCode: code }) => {
      exitCode = code;
      done(code);
    }),
  );
  terminal.onData((chunk) => {
    output += chunk;
    xterm.write(chunk);
    for (const check of rawWatchers) check();
  });

  // xterm parses writes asynchronously; an empty write's callback runs only
  // after every previously queued chunk has been processed. Bounded so a
  // wedged parser can never hang a test teardown.
  const flushGrid = () =>
    Promise.race<void>([
      new Promise<void>((done) => xterm.write("", () => done())),
      new Promise<void>((done) => setTimeout(done, 1_000)),
    ]);

  const viewportLines = (): string[] => {
    const buffer = xterm.buffer.active;
    const lines: string[] = [];
    for (let row = 0; row < rows; row++) {
      const line = buffer.getLine(buffer.baseY + row);
      lines.push(line ? line.translateToString(true).replace(/\s+$/u, "") : "");
    }
    return lines;
  };

  const fail = (what: string, timeoutMs: number): Error => {
    const tail = output.slice(-4_000);
    const grid = viewportLines()
      .map((line, index) => `${String(index).padStart(2)}|${line}`)
      .join("\n");
    return new Error(
      `Terminal did not show ${what} within ${timeoutMs}ms.\n` +
        `--- rendered grid ---\n${grid}\n--- raw tail ---\n${tail}`,
    );
  };

  const waitForRaw = (text: string, timeoutMs = DEFAULT_TIMEOUT_MS) =>
    new Promise<void>((done, reject) => {
      const timer = setTimeout(() => {
        rawWatchers.delete(check);
        reject(fail(`${JSON.stringify(text)} in raw output`, timeoutMs));
      }, timeoutMs);
      const check = () => {
        if (!output.includes(text)) return;
        clearTimeout(timer);
        rawWatchers.delete(check);
        done();
      };
      rawWatchers.add(check);
      check();
    });

  const waitForGridText = async (
    text: string,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      await flushGrid();
      if (viewportLines().some((line) => line.includes(text))) return;
      if (Date.now() >= deadline) {
        throw fail(`${JSON.stringify(text)} in rendered grid`, timeoutMs);
      }
      await new Promise((done) => setTimeout(done, GRID_POLL_MS));
    }
  };

  const session: TerminalSession = {
    get rawOutput() {
      return output;
    },
    get exitCode() {
      return exitCode;
    },
    closed,
    waitForRaw,
    waitForGridText,
    async gridLines() {
      await flushGrid();
      return viewportLines();
    },
    async gridText() {
      return (await session.gridLines()).join("\n");
    },
    async cellAt(column, row) {
      await flushGrid();
      const buffer = xterm.buffer.active;
      const line = buffer.getLine(buffer.baseY + row);
      if (!line || column < 0 || column >= line.length) return null;
      const cell = line.getCell(column);
      if (!cell) return null;
      return {
        chars: cell.getChars(),
        fg: cell.getFgColor(),
        bg: cell.getBgColor(),
        bold: cell.isBold() === 1,
        italic: cell.isItalic() === 1,
        underline: cell.isUnderline() === 1,
        inverse: cell.isInverse() === 1,
      };
    },
    type(text) {
      // Written as plain keystroke bytes — never as bracketed paste — so
      // readline/blessed keypress handling behaves exactly like a human typing.
      terminal.write(text);
    },
    key(namedKey) {
      terminal.write(KEY_SEQUENCES[namedKey]);
    },
    resize(nextCols, nextRows) {
      terminal.resize(nextCols, nextRows);
      xterm.resize(nextCols, nextRows);
      rows = nextRows;
    },
    async close(timeoutMs = 10_000) {
      if (exitCode !== undefined) return exitCode;
      terminal.kill();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          closed,
          new Promise<undefined>((done) => {
            timer = setTimeout(() => done(undefined), timeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
  return session;
}

/**
 * Test-facing guard: tear down a session and its profile with bounded waits,
 * reporting the retained profile path when a child refuses to stop.
 */
export async function destroyTerminalSession(
  session: TerminalSession | undefined,
  profile: TerminalProfile,
): Promise<void> {
  if (session) {
    const code = await session.close();
    if (code === undefined) {
      // Deliberately retain the profile tree for post-mortem inspection.
      throw new Error(
        `Terminal did not stop; profile retained at ${profile.profile}`,
      );
    }
  }
  profile.cleanup();
}
