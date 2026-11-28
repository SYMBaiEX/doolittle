import { PassThrough } from "node:stream";
import blessed from "blessed";
import { describe, expect, it, vi } from "vitest";
import { buildHeaderContent } from "../../apps/cli/src/cli/cockpit-chrome";
import { clipControlDeckText } from "../../apps/cli/src/cli/control-deck/width";
import {
  supportsTerminalUnicode,
  terminalGlyph,
} from "../../apps/cli/src/cli/terminal-glyphs";
import { installTuiRuntimeObservers } from "../../apps/cli/src/cli/tui-runtime-observers";
import { installTuiScreenEvents } from "../../apps/cli/src/cli/tui-screen-events";
import { renderCliTurnEvent } from "../../apps/cli/src/cli/turn-events";
import { getTuiTheme } from "../../packages/agent/src/runtime/theme-catalog";

function withLocale<T>(locale: string, run: () => T): T {
  const original = process.env.LC_ALL;
  process.env.LC_ALL = locale;
  try {
    return run();
  } finally {
    if (original === undefined) {
      delete process.env.LC_ALL;
    } else {
      process.env.LC_ALL = original;
    }
  }
}

describe("terminal glyph selection", () => {
  it("detects UTF-8 capability from locale variables in precedence order", () => {
    expect(supportsTerminalUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LANG: "C.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LANG: "C" })).toBe(false);
    expect(supportsTerminalUnicode({ LANG: "POSIX" })).toBe(false);
    expect(supportsTerminalUnicode({ LANG: "en_US.ISO8859-1" })).toBe(false);
    // LC_ALL wins over LC_CTYPE and LANG.
    expect(supportsTerminalUnicode({ LC_ALL: "C", LANG: "en_US.UTF-8" })).toBe(
      false,
    );
    expect(supportsTerminalUnicode({ LC_ALL: "C.UTF-8", LANG: "C" })).toBe(
      true,
    );
    // LC_CTYPE wins over LANG when LC_ALL is unset.
    expect(
      supportsTerminalUnicode({ LC_CTYPE: "C", LANG: "en_US.UTF-8" }),
    ).toBe(false);
    // No locale evidence keeps the unicode set: modern terminal emulators
    // negotiate UTF-8 rendering regardless of shell locale variables.
    expect(supportsTerminalUnicode({})).toBe(true);
    expect(supportsTerminalUnicode({ LC_ALL: "", LANG: "" })).toBe(true);
  });

  it("falls back to ASCII separators in cockpit chrome under a POSIX locale", () => {
    const theme = getTuiTheme("orange");
    const original = process.env.LC_ALL;
    try {
      process.env.LC_ALL = "C";
      const ascii = buildHeaderContent("Doolittle", theme);
      expect(ascii).not.toContain("·");
      expect(ascii).toContain("cockpit for observability | shell");
      process.env.LC_ALL = "en_US.UTF-8";
      expect(buildHeaderContent("Doolittle", theme)).toContain("·");
    } finally {
      if (original === undefined) {
        delete process.env.LC_ALL;
      } else {
        process.env.LC_ALL = original;
      }
    }
  });

  it("picks the unicode glyph when supported and the ASCII fallback otherwise", () => {
    expect(terminalGlyph("┌", "+", true)).toBe("┌");
    expect(terminalGlyph("┌", "+", false)).toBe("+");
    expect(terminalGlyph("█", "#", false)).toBe("#");
  });

  it("falls back to ASCII separators in job turn events", () => {
    const event = {
      type: "start" as const,
      timestamp: "2026-01-02T12:00:00.000Z",
      sessionId: "cli:one",
      command: "inspect",
    };

    expect(withLocale("en_US.UTF-8", () => renderCliTurnEvent(event))).toBe(
      "job started · session cli:one · inspect",
    );
    expect(withLocale("C", () => renderCliTurnEvent(event))).toBe(
      "job started | session cli:one | inspect",
    );
  });

  it("falls back to ASCII ellipses in control-deck clipping", () => {
    expect(
      withLocale("en_US.UTF-8", () => clipControlDeckText("abcdef", 4)),
    ).toBe("abc…");
    expect(withLocale("C", () => clipControlDeckText("abcdef", 4))).toBe(
      "a...",
    );
  });

  it("falls back to ASCII arrows in terminal runtime observer activity", () => {
    const harness = installRuntimeObserverHarness();
    try {
      const unicodeMessage = withLocale("en_US.UTF-8", () =>
        harness.emitTerminal("echo hi", 0),
      );
      const asciiMessage = withLocale("C", () =>
        harness.emitTerminal("echo hi", 0),
      );

      expect(unicodeMessage).toBe("echo hi → 0");
      expect(asciiMessage).toBe("echo hi -> 0");
    } finally {
      harness.dispose();
    }
  });

  it("falls back to ASCII size markers in resize warnings", () => {
    const captureWarning = (locale: string): string => {
      const output = new PassThrough() as PassThrough & {
        columns: number;
        rows: number;
      };
      output.columns = 40;
      output.rows = 10;
      const input = new PassThrough();
      const screen = blessed.screen({
        smartCSR: false,
        output: output as never,
        input: input as never,
        terminal: "xterm-256color",
      });
      const messages: string[] = [];
      try {
        installTuiScreenEvents({
          screen: screen as never,
          minCols: 80,
          minRows: 24,
          appendActivity: (_kind, message) => {
            messages.push(message);
          },
          syncLayout: () => {},
          scheduleRefreshPanels: () => {},
          noteWarningFooterHint: () => {},
          refreshPanels: vi.fn(async () => {}),
          focusTrackedElements: [],
          textEntryElements: [],
          noteTextEntryActivity: () => {},
          updateFooterHint: () => {},
        });
        withLocale(locale, () => screen.emit("resize"));
        return messages.at(-1) ?? "";
      } finally {
        screen.destroy();
      }
    };

    expect(captureWarning("en_US.UTF-8")).toContain("(40×10)");
    expect(captureWarning("C")).toContain("(40x10)");
  });
});

function installRuntimeObserverHarness() {
  let terminalUpdate:
    | ((event: { detail: string; exitCode: number }) => void)
    | undefined;
  const messages: string[] = [];
  const unsubscribe = () => () => {};
  const context = {
    gateway: { onUpdate: () => unsubscribe() },
    services: {
      terminal: {
        onUpdate: (handler: typeof terminalUpdate) => {
          terminalUpdate = handler;
          return unsubscribe();
        },
      },
      delegationProjection: { onUpdate: () => unsubscribe() },
      runController: { onUpdate: () => unsubscribe() },
      startupState: { onUpdate: () => unsubscribe() },
      sessions: { onActivity: () => unsubscribe() },
      apiTransport: { onUpdate: () => unsubscribe() },
    },
  };

  const dispose = installTuiRuntimeObservers({
    context: context as never,
    state: { activeSessionId: "session" } as never,
    isBusy: () => false,
    appendActivity: (_kind, message) => {
      messages.push(message);
    },
    pushNotice: () => {},
    pushLiveToolEvent: () => {},
    getLiveResponse: () => undefined,
    refreshLiveResponse: () => {},
    scheduleRefreshPanels: () => {},
  });

  return {
    emitTerminal(detail: string, exitCode: number): string {
      terminalUpdate?.({ detail, exitCode });
      return messages.at(-1) ?? "";
    },
    dispose,
  };
}
