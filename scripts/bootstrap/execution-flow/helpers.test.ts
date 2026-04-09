import { describe, expect, it } from "bun:test";
import type { WizardAnswers } from "../types";
import {
  applyExecutionFlowResult,
  resolveAcpPresetCommand,
  resolveBackendProbeKey,
  resolveExecutionToolDefaults,
  resolveMcpPresetCommand,
  resolvePreferredBrowserDefault,
} from "./helpers";

describe("bootstrap execution flow helpers", () => {
  it("resolves browser defaults and backend probe keys", () => {
    expect(
      resolvePreferredBrowserDefault(
        new Map([["DOOLITTLE_BROWSER_PROVIDER", "lightpanda"]]),
        [
          {
            key: "lightpanda",
            label: "Lightpanda",
            detail: "browser automation",
            installed: true,
          },
        ],
      ),
    ).toBe("lightpanda");
    expect(
      resolvePreferredBrowserDefault(new Map(), [
        {
          key: "lightpanda",
          label: "Lightpanda",
          detail: "browser automation",
          installed: false,
        },
      ]),
    ).toBe("basic");
    expect(resolveBackendProbeKey("daytona")).toBe("daytona");
    expect(resolveBackendProbeKey("local")).toBeUndefined();
  });

  it("resolves tool defaults and preset commands", () => {
    const env = new Map([
      ["MCP_SERVER_COMMAND", "mcp"],
      ["ACP_SERVER_COMMAND", "acp"],
      ["FAL_API_KEY", "fal"],
      ["GITHUB_TOKEN", "gh"],
    ]);
    expect(resolveExecutionToolDefaults("quick", env)).toEqual({
      mcp: true,
      acp: true,
      tts: true,
      codegen: true,
    });
    expect(resolveMcpPresetCommand("filesystem")).toContain(
      "@modelcontextprotocol/server-filesystem",
    );
    expect(resolveAcpPresetCommand("local-agent")).toBe("doolittle api");
  });

  it("applies execution results back onto the wizard answer bag", () => {
    const answers = {
      mode: "quick",
    } as WizardAnswers;
    applyExecutionFlowResult(answers, {
      runDepth: "standard",
      maxIterations: 45,
      toolProgressMode: "new",
      backend: "local",
      browser: "basic",
      sshHost: "",
      sshUser: "",
      sshPath: "",
      daytonaTarget: "",
      modalTarget: "",
      transports: ["telegram"],
      pairingMode: "pair",
      allowAllUsers: false,
      telegramBotToken: "telegram-token",
      discordBotToken: "",
      slackWebhookUrl: "",
      slackSigningSecret: "",
      homeAssistantUrl: "",
      homeAssistantToken: "",
      tools: { mcp: true, acp: false, tts: false, codegen: true },
      mcpServerCommand: "mcp",
      acpServerCommand: "",
      falApiKey: "",
      e2bApiKey: "e2b",
      githubToken: "gh",
    });
    expect(answers.backend).toBe("local");
    expect(answers.transports).toEqual(["telegram"]);
    expect(answers.tools.codegen).toBe(true);
    expect(answers.githubToken).toBe("gh");
  });
});
