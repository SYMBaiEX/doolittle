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
      ELIZA_ACP_STATE_DIR: "/shared/acp",
      ACP_AUDIT_LOG_PATH: "/shared/acp/audit.ndjson",
      ELIZA_HOME: "/shared/eliza",
      PGLITE_DATA_DIR: "/shared/sql",
      DATABASE_URL: "postgres://synthetic/shared",
      POSTGRES_URL: "postgres://synthetic/another-shared",
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
      ELIZA_ACP_STATE_DIR: "/private/eval/acp",
      ACP_AUDIT_LOG_PATH: "/private/eval/acp/audit.ndjson",
      ELIZA_HOME: "/private/eval/data",
      PGLITE_DATA_DIR: "/private/eval/data/pglite",
      DATABASE_URL: "",
      POSTGRES_URL: "",
      DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
      DOOLITTLE_USE_LINKED_CODEX_AUTH: "true",
      ELIZA_API_BIND: "127.0.0.1",
      ELIZA_API_PORT: "0",
    });
    expect(environment.ELIZAOS_CLOUD_API_KEY).toBeUndefined();
    expect(environment.ELIZA_CLOUD_API_KEY).toBeUndefined();
    expect(baseEnvironment.DOOLITTLE_DATA_DIR).toBe("/shared/data");
    expect(baseEnvironment.ELIZA_ACP_STATE_DIR).toBe("/shared/acp");
    expect(baseEnvironment.DATABASE_URL).toBe("postgres://synthetic/shared");
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

  it.each([
    "ELIZA_ACP_STATE_DIR",
    "ACP_AUDIT_LOG_PATH",
    "ELIZA_HOME",
    "PGLITE_DATA_DIR",
  ])("rejects missing or shared SDK state %s before dispatch", (key) => {
    const environment = createEvalRuntimeEnvironment(options);
    delete environment[key];
    expect(() => assertEvalRuntimeEnvironment(environment, options)).toThrow(
      "SDK state preflight failed",
    );
    environment[key] = "/shared/state";
    expect(() => assertEvalRuntimeEnvironment(environment, options)).toThrow(
      "SDK state preflight failed",
    );
  });

  it.each(["POSTGRES_URL", "DATABASE_URL"])(
    "rejects a nonempty %s after environment construction",
    (key) => {
      const environment = createEvalRuntimeEnvironment(options);
      environment[key] = "postgres://synthetic/shared";
      expect(() => assertEvalRuntimeEnvironment(environment, options)).toThrow(
        "database isolation preflight failed",
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
