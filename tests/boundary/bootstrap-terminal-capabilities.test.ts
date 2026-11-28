import { afterEach, describe, expect, it } from "vitest";
import {
  createBootstrapOutput,
  paint,
} from "../../scripts/bootstrap/core/output";
import {
  supportsTerminalUnicode,
  terminalColorEnabled,
  terminalGlyph,
} from "../../scripts/bootstrap/core/terminal-capabilities";

const ENV_KEYS = ["NO_COLOR", "FORCE_COLOR", "LC_ALL", "LC_CTYPE", "LANG"];
const savedEnv = new Map(
  ENV_KEYS.map((key) => [key, process.env[key]] as const),
);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function captureLogs(run: () => void): string {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    run();
  } finally {
    console.log = original;
  }
  return lines.join("\n");
}

describe("bootstrap terminal color policy", () => {
  it("disables color when output is not a TTY", () => {
    expect(terminalColorEnabled({ isTTY: false }, {})).toBe(false);
    expect(terminalColorEnabled({}, {})).toBe(false);
  });

  it("enables color on a TTY without NO_COLOR", () => {
    expect(terminalColorEnabled({ isTTY: true }, {})).toBe(true);
  });

  it("lets a non-empty NO_COLOR disable color even on a TTY", () => {
    expect(terminalColorEnabled({ isTTY: true }, { NO_COLOR: "1" })).toBe(
      false,
    );
    expect(terminalColorEnabled({ isTTY: true }, { NO_COLOR: "" })).toBe(true);
  });

  it("lets FORCE_COLOR win over NO_COLOR and non-TTY streams", () => {
    expect(
      terminalColorEnabled(
        { isTTY: false },
        { FORCE_COLOR: "1", NO_COLOR: "1" },
      ),
    ).toBe(true);
    expect(terminalColorEnabled({ isTTY: false }, { FORCE_COLOR: "0" })).toBe(
      false,
    );
  });
});

describe("bootstrap terminal unicode policy", () => {
  it("selects unicode when the locale advertises UTF-8 or is absent", () => {
    expect(supportsTerminalUnicode({})).toBe(true);
    expect(supportsTerminalUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
    expect(supportsTerminalUnicode({ LC_ALL: "C.UTF-8" })).toBe(true);
  });

  it("selects ASCII in POSIX/C and non-UTF-8 locales", () => {
    expect(supportsTerminalUnicode({ LC_ALL: "C" })).toBe(false);
    expect(supportsTerminalUnicode({ LC_ALL: "POSIX" })).toBe(false);
    expect(supportsTerminalUnicode({ LANG: "en_US.ISO-8859-1" })).toBe(false);
  });

  it("honors locale precedence LC_ALL over LC_CTYPE over LANG", () => {
    expect(supportsTerminalUnicode({ LC_ALL: "C", LANG: "en_US.UTF-8" })).toBe(
      false,
    );
    expect(
      supportsTerminalUnicode({ LC_CTYPE: "C", LANG: "en_US.UTF-8" }),
    ).toBe(false);
  });

  it("switches glyphs through the same capability bit", () => {
    expect(terminalGlyph("●", "*", true)).toBe("●");
    expect(terminalGlyph("●", "*", false)).toBe("*");
  });
});

describe("bootstrap line-mode output wiring", () => {
  it("paints nothing when NO_COLOR is set", () => {
    process.env.NO_COLOR = "1";
    delete process.env.FORCE_COLOR;
    expect(paint("hello", "\u001b[31m")).toBe("hello");
  });

  it("paints when FORCE_COLOR overrides a non-TTY stream", () => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    expect(paint("hello", "\u001b[31m")).toBe("\u001b[31mhello\u001b[0m");
  });

  it("renders the banner frame in ASCII in a non-UTF-8 locale", () => {
    process.env.LC_ALL = "C";
    const output = createBootstrapOutput(() => null);
    const rendered = captureLogs(() => output.banner());
    expect(rendered).toContain("+---");
    expect(rendered).not.toContain("╔");
  });

  it("renders the banner frame in unicode under a UTF-8 locale", () => {
    process.env.LC_ALL = "C.UTF-8";
    const output = createBootstrapOutput(() => null);
    const rendered = captureLogs(() => output.banner());
    expect(rendered).toContain("╔");
  });

  it("prints the banner once even when invoked repeatedly", () => {
    process.env.LC_ALL = "C.UTF-8";
    const output = createBootstrapOutput(() => null);
    const rendered = captureLogs(() => {
      output.banner();
      output.banner();
    });
    expect(rendered.split("DOOLITTLE // AWAKENING")).toHaveLength(2);
  });

  it("marks sections with an ASCII bullet in a non-UTF-8 locale", () => {
    process.env.LC_ALL = "C";
    const output = createBootstrapOutput(() => null);
    const rendered = captureLogs(() => output.section("Face"));
    expect(rendered).toContain("* Face");
    expect(rendered).not.toContain("◆");
  });
});
