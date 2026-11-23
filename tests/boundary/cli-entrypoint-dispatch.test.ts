import { describe, expect, it } from "vitest";
import { resolveStaticCliInput } from "../../apps/cli/src/cli/execution/static";
import { renderHelp } from "../../apps/cli/src/entrypoint/help";
import { resolveEntrypointInvocation } from "../../apps/cli/src/entrypoint/invocation";
import { resolveEntrypointCommandPlan } from "../../apps/cli/src/entrypoint/runtime-control";
import {
  type EntrypointSubcommand,
  isEntrypointAliasCommand,
  parseOneShotOptions,
  resolveEntrypointAliasPrompt,
  resolveHelpTopic,
  resolveSubcommand,
} from "../../apps/cli/src/entrypoint/subcommand";

describe("CLI entrypoint dispatch", () => {
  it.each(["exec", "run"])(
    "keeps prompt values out of global dispatch for %s",
    (command) => {
      expect(resolveSubcommand([command, "-p", "--version"])).toEqual({
        command: "exec",
        rest: ["-p", "--version"],
      });
      expect(resolveSubcommand([command, "--", "--help"])).toEqual({
        command: "exec",
        rest: ["--", "--help"],
      });
      expect(
        resolveSubcommand([command, "-p", "--version", "--help"]).command,
      ).toBe("help");
    },
  );

  it.each([
    [["exec", "--help"], "exec"],
    [["run", "-h"], "exec"],
    [["exec", "-p", "text", "--json", "--help"], "exec"],
    [["jobs", "--help"], "jobs"],
    [["jobs", "show", "-h"], "jobs"],
  ])("routes %j to the %s help topic", (args, topic) => {
    expect(resolveSubcommand(args)).toEqual({ command: "help", rest: [topic] });
  });

  it.each([
    ["exec", "--cli", "--help"],
    ["run", "-h", "--cli"],
    ["jobs", "--cli", "-h"],
  ])("keeps --cli ahead of topic help for %j", (...args) => {
    expect(resolveSubcommand(args).command).toBe("cockpit");
  });

  it("keeps help flags that are prompt text inside exec", () => {
    expect(resolveSubcommand(["exec", "-p", "--help"]).command).toBe("exec");
    expect(resolveSubcommand(["exec", "--", "-h"]).command).toBe("exec");
  });

  it.each([
    [undefined, undefined],
    ["exec", "exec"],
    ["run", "exec"],
    ["jobs", "jobs"],
    ["status", undefined],
    ["--gateway", undefined],
  ])("resolves help topic for %s", (argument, topic) => {
    expect(resolveHelpTopic(argument)).toBe(topic);
  });

  it("documents exec input, session and job controls in top-level help", () => {
    const help = renderHelp();
    for (const text of [
      "--prompt-stdin",
      "--session-id <id>",
      "doolittle exec --help",
      "doolittle jobs show <job-id>",
      "doolittle jobs attach <job-id>",
      "doolittle jobs cancel <job-id>",
    ])
      expect(help).toContain(text);
  });

  it("gives exec and jobs their own usage text", () => {
    const execHelp = renderHelp("exec");
    expect(execHelp).toMatch(/^Usage: doolittle exec /);
    for (const option of [
      "-p, --prompt <text>",
      "--prompt-stdin",
      "--json",
      "--json-stream",
      "--session-id <id>",
      "--background",
    ])
      expect(execHelp).toContain(option);
    expect(execHelp).not.toContain("--job-id");
    const jobsHelp = renderHelp("jobs");
    expect(jobsHelp).toMatch(/^Usage: doolittle jobs /);
    for (const action of [
      "list",
      "show <job-id>",
      "attach <job-id>",
      "cancel <job-id>",
    ])
      expect(jobsHelp).toContain(action);
  });

  it.each(["-p", "--prompt", "--session-id", "--job-id"])(
    "requires a value for %s",
    (option) => {
      expect(() => parseOneShotOptions([option])).toThrow(
        `${option} requires a value.`,
      );
      expect(() => parseOneShotOptions([`${option}=`])).toThrow(
        `${option} requires a value.`,
      );
    },
  );

  it.each(["--session-id", "--job-id"])(
    "does not consume an option as %s",
    (option) => {
      expect(() =>
        parseOneShotOptions(["-p", "/help", option, "--json"]),
      ).toThrow(`${option} requires a value.`);
    },
  );

  it.each(["--session-id", "--job-id"])(
    "preserves end-of-options after a missing %s value",
    (option) => {
      const selection = resolveSubcommand(["exec", option, "--", "--version"]);
      expect(selection.command).toBe("exec");
      expect(() => parseOneShotOptions(selection.rest)).toThrow(
        `${option} requires a value.`,
      );
    },
  );

  it("rejects unknown options even with an explicit prompt", () => {
    expect(() => parseOneShotOptions(["-p", "/help", "--bogus"])).toThrow(
      "Unknown exec option: --bogus.",
    );
  });

  it("does not expose unknown option values in usage errors", () => {
    const parse = () => parseOneShotOptions(["--api-key=private-value"]);
    expect(parse).toThrow("Unknown exec option: --api-key.");
    expect(parse).not.toThrow(/private-value/);
  });

  it("accepts flag-shaped prompts, inline values, and end-of-options text", () => {
    expect(parseOneShotOptions(["-p", "--version"]).prompt).toBe("--version");
    expect(
      parseOneShotOptions([
        "--prompt=a=b",
        "--session-id=session",
        "--job-id=job",
        "--json",
      ]),
    ).toMatchObject({
      prompt: "a=b",
      sessionId: "session",
      jobId: "job",
      json: true,
    });
    expect(parseOneShotOptions(["-p=--help"]).prompt).toBe("--help");
    expect(parseOneShotOptions(["--", "--help", "-p", "text"]).prompt).toBe(
      "--help -p text",
    );
    expect(parseOneShotOptions([])).toMatchObject({
      prompt: undefined,
      json: false,
    });
  });

  it("uses the interactive command-search response for a pre-boot alias", async () => {
    const invocation = await resolveEntrypointInvocation(
      resolveSubcommand(["exec", "-p", "/commands-search"]),
      { env: {}, repoRoot: process.cwd() },
    );
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
