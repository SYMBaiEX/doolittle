import { describe, expect, it } from "vitest";
import {
  assertEvalRuntimeEnvironment,
  createEvalRuntimeEnvironment,
} from "./runtime-environment";

const options = {
  repoRoot: "/repo",
  root: "/private/eval",
  mode: "api" as const,
};

describe("canonical evaluation runtime preflight", () => {
  it("overrides transient shared state and strips cloud keys without changing the caller", () => {
    const baseEnvironment = {
      DOOLITTLE_DATA_DIR: "/shared/data",
      DOOLITTLE_GATEWAY_DATA_DIR: "/shared/gateway",
      DOOLITTLE_HOOKS_DIR: "/shared/hooks",
      DOOLITTLE_WORKSPACE_DIR: "/repo",
      ELIZAOS_CLOUD_API_KEY: "synthetic-cloud-key",
      ELIZA_CLOUD_API_KEY: "another-synthetic-key",
    };
    const environment = createEvalRuntimeEnvironment({
      ...options,
      baseEnvironment,
    });
    expect(environment).toMatchObject({
      DOOLITTLE_DATA_DIR: "/private/eval/data",
      DOOLITTLE_GATEWAY_DATA_DIR: "/private/eval/gateway",
      DOOLITTLE_HOOKS_DIR: "/private/eval/hooks",
      DOOLITTLE_WORKSPACE_DIR: "/private/eval/workspace",
      DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
      DOOLITTLE_USE_LINKED_CODEX_AUTH: "true",
      ELIZA_API_BIND: "127.0.0.1",
      ELIZA_API_PORT: "0",
    });
    expect(environment.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(environment.ELIZA_CLOUD_API_KEY).toBeUndefined();
    expect(baseEnvironment.DOOLITTLE_DATA_DIR).toBe("/shared/data");
    expect(() =>
      assertEvalRuntimeEnvironment(environment, options),
    ).not.toThrow();
  });

  it.each([
    ["DOOLITTLE_WORKSPACE_DIR", "WORKSPACE_DIR"],
    ["DOOLITTLE_GATEWAY_DATA_DIR", "GATEWAY_DATA_DIR"],
    ["DOOLITTLE_HOOKS_DIR", "HOOKS_DIR"],
    ["DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE", "EVAL_CAPTURE_MODEL_USAGE"],
    ["DOOLITTLE_USE_LINKED_CODEX_AUTH", "USE_LINKED_CODEX_AUTH"],
  ])(
    "rejects shorthand %s configuration before dispatch",
    (canonical, shorthand) => {
      const environment = createEvalRuntimeEnvironment(options);
      environment[shorthand] = environment[canonical];
      delete environment[canonical];
      expect(() => assertEvalRuntimeEnvironment(environment, options)).toThrow(
        "preflight failed",
      );
    },
  );

  it("rejects relative roots and permits an explicit absolute fresh fixture", () => {
    expect(() =>
      createEvalRuntimeEnvironment({ ...options, root: "." }),
    ).toThrow("absolute");
    expect(
      createEvalRuntimeEnvironment({
        ...options,
        workspaceDir: "/private/eval/empty-starter",
      }).DOOLITTLE_WORKSPACE_DIR,
    ).toBe("/private/eval/empty-starter");
  });
});
