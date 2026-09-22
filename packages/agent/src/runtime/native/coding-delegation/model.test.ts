import { afterEach, describe, expect, it, vi } from "vitest";
import { codexCommandForRoute, codexSpawnEnvironmentForRoute } from "./model";

afterEach(() => vi.unstubAllEnvs());

describe("Codex ACP compatibility", () => {
  it("uses the maintained pinned adapter and its documented config environment", () => {
    vi.stubEnv("CODEX_CONFIG", '{"sandbox_mode":"read-only","model":"old"}');
    const command = codexCommandForRoute({
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
    });
    expect(command).toBe("npx -y @agentclientprotocol/codex-acp@1.12.0");
    const env = codexSpawnEnvironmentForRoute({
      command,
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
      env: { TASK_LABEL: "readonly-check" },
    });
    expect(env?.TASK_LABEL).toBe("readonly-check");
    expect(env?.INITIAL_AGENT_MODE).toBe("read-only");
    expect(JSON.parse(env?.CODEX_CONFIG ?? "{}")).toEqual({
      sandbox_mode: "read-only",
      model: "gpt-5.6-luna",
      model_reasoning_effort: "medium",
    });
    expect(process.env.CODEX_CONFIG).toBe(
      '{"sandbox_mode":"read-only","model":"old"}',
    );
    expect(env).not.toHaveProperty("CODEX_HOME");
    expect(env).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("preserves custom legacy commands and their existing options", () => {
    const custom =
      "npx -y @zed-industries/codex-acp@0.16.0 -c 'sandbox_mode=\"read-only\"'";
    const command = codexCommandForRoute({
      command: custom,
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
    });
    expect(command).toBe(
      `${custom} -c 'model="gpt-5.6-luna"' -c 'model_reasoning_effort="medium"'`,
    );
    const env = { TASK_LABEL: "original" };
    expect(
      codexSpawnEnvironmentForRoute({ command, model: "gpt-5.6-luna", env }),
    ).toBe(env);
  });

  it("preserves custom modern command versions and merges per-spawn config", () => {
    const custom = "npx -y @agentclientprotocol/codex-acp@1.12.1-preview.4";
    const command = codexCommandForRoute({
      command: custom,
      model: "gpt-5.6-sol",
    });
    expect(command).toBe(custom);
    vi.stubEnv("CODEX_CONFIG", '{"ambient":true}');
    const env = codexSpawnEnvironmentForRoute({
      command,
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      env: { CODEX_CONFIG: '{"sandbox_mode":"read-only"}' },
    });
    expect(JSON.parse(env?.CODEX_CONFIG ?? "{}")).toEqual({
      sandbox_mode: "read-only",
      model: "gpt-5.6-sol",
      model_reasoning_effort: "high",
    });
  });

  it.each(["not-json", "[]", "null"])(
    "rejects invalid CODEX_CONFIG %s without falling back",
    (config) => {
      expect(() =>
        codexSpawnEnvironmentForRoute({
          command: codexCommandForRoute({ model: "gpt-5.6-luna" }),
          model: "gpt-5.6-luna",
          env: { CODEX_CONFIG: config },
        }),
      ).toThrow();
    },
  );

  it.each(["readonly", "read-only", "deny-all", "unknown"])(
    "fails closed for security policy %s",
    (approvalPreset) => {
      expect(() =>
        codexSpawnEnvironmentForRoute({
          command: codexCommandForRoute({ model: "gpt-5.6-luna" }),
          model: "gpt-5.6-luna",
          approvalPreset,
        }),
      ).toThrow("CODING_APPROVAL_POLICY_UNSUPPORTED");
    },
  );

  it.each(["standard", "permissive", "autonomous"])(
    "retains human approval for %s instead of enabling auto-review",
    (approvalPreset) => {
      expect(
        codexSpawnEnvironmentForRoute({
          command: codexCommandForRoute({ model: "gpt-5.6-luna" }),
          model: "gpt-5.6-luna",
          approvalPreset,
          env: { INITIAL_AGENT_MODE: "agent-full-access" },
        })?.INITIAL_AGENT_MODE,
      ).toBe("read-only");
    },
  );

  it("does not mistake initial read-only config for enforced per-turn read-only policy", () => {
    expect(() =>
      codexSpawnEnvironmentForRoute({
        command: codexCommandForRoute({ model: "gpt-5.6-luna" }),
        model: "gpt-5.6-luna",
        approvalPreset: "readonly",
        env: {
          INITIAL_AGENT_MODE: "read-only",
          CODEX_CONFIG:
            '{"sandbox_mode":"read-only","approval_policy":"never"}',
        },
      }),
    ).toThrow("CODING_APPROVAL_POLICY_UNSUPPORTED");
  });
});
