import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntime, IAgentRuntime, Service } from "@elizaos/core";
import {
  createDatabaseAdapter,
  PgliteDatabaseAdapter,
} from "@elizaos/plugin-sql";
import { afterEach, expect, it, vi } from "vitest";
import {
  resolveTrajectoryCaptureBudget,
  setDefaultTrajectoryCapture,
} from "../../packages/agent/src/runtime/bootstrap/env/trajectory-capture";
import { enforceTrajectoryCaptureBudget } from "../../packages/agent/src/runtime/bootstrap/runtime/trajectory-capture-budget";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

it("bounds opt-in capture outside an isolated evaluation profile", () => {
  const disabled = {};
  setDefaultTrajectoryCapture(disabled);
  expect(resolveTrajectoryCaptureBudget(disabled)).toBeUndefined();

  const enabled = {
    ELIZA_TRAJECTORY_LOGGING: "true",
    DOOLITTLE_TRACE_MAX_MINUTES: "999",
    DOOLITTLE_TRACE_MAX_MIB: "3",
  };
  expect(resolveTrajectoryCaptureBudget(enabled)).toEqual({
    durationMs: 30 * 60_000,
    relationBytes: 3 * 1024 * 1024,
  });

  const dataDir = join(tmpdir(), "eval", "data");
  const isolated = {
    ...enabled,
    DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
    DOOLITTLE_DATA_DIR: dataDir,
    ELIZA_HOME: dataDir,
    ELIZA_STATE_DIR: dataDir,
    ELIZA_VAULT_DISABLE_KEYCHAIN: "1",
    PGLITE_DATA_DIR: join(dataDir, "pglite"),
  };
  expect(resolveTrajectoryCaptureBudget(isolated)).toBeUndefined();
  expect(
    resolveTrajectoryCaptureBudget({
      ...isolated,
      PGLITE_DATA_DIR: join(tmpdir(), "shared"),
    }),
  ).toBeDefined();
  expect(
    resolveTrajectoryCaptureBudget({
      ...isolated,
      DATABASE_URL: "postgres://db",
    }),
  ).toBeDefined();
});

class BudgetRuntime {
  private budget?: { start(runtime: IAgentRuntime): Promise<Service> };
  service?: Service;
  readonly trajectory = { logLlmCall: vi.fn(), setEnabled: vi.fn() };
  readonly logger = { warn: vi.fn() };

  constructor(readonly adapter: unknown) {}

  getService() {
    return this.trajectory;
  }

  getServicesByType() {
    return [this.trajectory];
  }

  async registerService(budget: NonNullable<BudgetRuntime["budget"]>) {
    this.budget = budget;
  }

  async getServiceLoadPromise() {
    this.service = await this.budget?.start(this as unknown as IAgentRuntime);
    return this.service;
  }
}

it("stops capture before adding records to an over-budget trajectory table", async () => {
  vi.stubEnv("ELIZA_TRAJECTORY_LOGGING", "true");
  vi.stubEnv("DOOLITTLE_TRACE_MAX_MIB", "1");
  const adapter = createDatabaseAdapter({ dataDir: "memory://" }, randomUUID());
  try {
    if (!(adapter instanceof PgliteDatabaseAdapter)) {
      throw new Error("Expected the local PGlite adapter");
    }
    await adapter.initialize();
    const client = adapter.getRawConnection();
    await client.exec(`
      CREATE TABLE trajectories (steps_json text);
      INSERT INTO trajectories
        SELECT string_agg(md5(i::text), '')
        FROM generate_series(1, 100000) AS i;
    `);

    const runtime = new BudgetRuntime(adapter);
    await enforceTrajectoryCaptureBudget(runtime as unknown as AgentRuntime);
    await runtime.service?.stop();
    expect(runtime.trajectory.setEnabled.mock.calls).toEqual([
      [false],
      [false],
    ]);
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "storage-budget" }),
      expect.stringContaining("Run receipts are still recorded"),
    );
    const { rows } = await client.query(
      "SELECT count(*) AS rows FROM trajectories",
    );
    expect(rows).toEqual([{ rows: 1 }]);
  } finally {
    await adapter.close();
  }
});

it("stops an active capture at the deadline and clears its timers", async () => {
  vi.stubEnv("ELIZA_TRAJECTORY_LOGGING", "true");
  vi.stubEnv("DOOLITTLE_TRACE_MAX_MINUTES", "1");
  vi.useFakeTimers();
  const execute = vi.fn(async () => ({ rows: [{ bytes: "0" }], fields: [] }));
  const runtime = new BudgetRuntime({ db: { execute } });
  try {
    await enforceTrajectoryCaptureBudget(runtime as unknown as AgentRuntime);
    expect(runtime.trajectory.setEnabled.mock.calls).toEqual([[false], [true]]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runtime.trajectory.setEnabled.mock.calls).toEqual([
      [false],
      [true],
      [false],
    ]);
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      { reason: "time-budget", maxMinutes: 1 },
      expect.stringContaining("trace may be incomplete"),
    );
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await runtime.service?.stop();
  }
});

it("checks the same persisted budget throughout an active capture", async () => {
  vi.stubEnv("ELIZA_TRAJECTORY_LOGGING", "true");
  vi.stubEnv("DOOLITTLE_TRACE_MAX_MIB", "1");
  vi.useFakeTimers();
  const execute = vi
    .fn<(query: unknown) => Promise<{ rows: { bytes: string }[] }>>()
    .mockResolvedValueOnce({ rows: [{ bytes: "0" }] })
    .mockResolvedValueOnce({ rows: [{ bytes: String(1024 * 1024) }] });
  const runtime = new BudgetRuntime({ db: { execute } });
  try {
    await enforceTrajectoryCaptureBudget(runtime as unknown as AgentRuntime);
    expect(runtime.trajectory.setEnabled).toHaveBeenLastCalledWith(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(runtime.trajectory.setEnabled).toHaveBeenLastCalledWith(false);
    expect(runtime.logger.warn).toHaveBeenCalledWith(
      {
        reason: "storage-budget",
        bytes: 1024 * 1024,
        maxBytes: 1024 * 1024,
      },
      expect.any(String),
    );
    expect(execute).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    await runtime.service?.stop();
  }
});
