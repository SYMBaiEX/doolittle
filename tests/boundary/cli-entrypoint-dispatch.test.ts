import { describe, expect, it } from "vitest";
import { resolveStaticCliInput } from "../../apps/cli/src/cli/execution/static";
import { resolveEntrypointInvocation } from "../../apps/cli/src/entrypoint/invocation";
import { resolveEntrypointCommandPlan } from "../../apps/cli/src/entrypoint/runtime-control";
import {
  type EntrypointSubcommand,
  isEntrypointAliasCommand,
  resolveEntrypointAliasPrompt,
  resolveSubcommand,
} from "../../apps/cli/src/entrypoint/subcommand";

describe("CLI entrypoint dispatch", () => {
  it("uses the interactive command-search response for a pre-boot alias", async () => {
    const invocation = await resolveEntrypointInvocation({
      argv: ["exec", "-p", "/commands-search"],
      env: {},
      repoRoot: process.cwd(),
    });
    expect(invocation.staticPromptResult).toEqual(
      resolveStaticCliInput("/commands search", {
        agentName: "Eliza",
        sessionOpen: true,
      }),
    );
    expect(invocation.staticPromptResult?.text).toBe(
      "Usage: /commands search <query>",
    );
  });

  it.each([
    ["tui", "cockpit"],
    ["gui", "desktop"],
    ["onboard", "setup"],
    ["bootstrap", "setup"],
    ["check", "doctor"],
    ["plain-cli", "plain"],
    ["run", "exec"],
  ])("resolves %s without consuming command arguments", (alias, command) => {
    expect(resolveSubcommand([alias, "argument"])).toEqual({
      command,
      rest: ["argument"],
    });
  });

  it("leaves desktop options with the desktop command", () => {
    expect(resolveSubcommand(["gui", "--help", "--source"])).toEqual({
      command: "desktop",
      rest: ["--help", "--source"],
    });
  });

  it("preserves global flag precedence and removes only the selected flags", () => {
    expect(resolveSubcommand(["--gateway", "--version", "-h", "text"])).toEqual(
      {
        command: "help",
        rest: ["--gateway", "--version", "text"],
      },
    );
    expect(resolveSubcommand(["--help", "--cli", "--cli", "text"])).toEqual({
      command: "cockpit",
      rest: ["--help", "text"],
    });
  });

  it.each(["constructor", "toString", "__proto__", "unknown"])(
    "treats %s as an initial prompt instead of a command",
    (prompt) => {
      expect(resolveSubcommand([prompt, "rest"])).toEqual({
        command: "start",
        rest: [prompt, "rest"],
      });
    },
  );

  it.each([
    ["status", "/status"],
    ["progress", "/progress"],
    ["tools", "/tools summary"],
    ["skills", "/skills"],
    ["runtime", "/runtime status"],
  ] as const)(
    "keeps %s shortcut dispatch and runtime planning aligned",
    (command, prompt) => {
      expect(isEntrypointAliasCommand(command)).toBe(true);
      expect(resolveEntrypointAliasPrompt(command, [])).toBe(prompt);
      expect(
        resolveEntrypointAliasPrompt(command, [" inspect ", "scope"]),
      ).toBe(`/${command} inspect  scope`);
      expect(resolveEntrypointCommandPlan(command)).toMatchObject({
        shouldUseCliSurface: true,
        startupMode: "cli",
      });
    },
  );

  it.each(["start", "desktop", "api", "exec"] as EntrypointSubcommand[])(
    "does not convert %s to a slash-command shortcut",
    (command) => {
      expect(isEntrypointAliasCommand(command)).toBe(false);
      expect(
        resolveEntrypointAliasPrompt(command, ["argument"]),
      ).toBeUndefined();
    },
  );

  it("defaults an empty invocation to start", () => {
    expect(resolveSubcommand([])).toEqual({ command: "start", rest: [] });
  });
});
