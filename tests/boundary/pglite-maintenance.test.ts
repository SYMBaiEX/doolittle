import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type IAgentRuntime, resolveTrajectoryGate } from "@elizaos/core";
import {
  createDatabaseAdapter,
  PgliteDatabaseAdapter,
} from "@elizaos/plugin-sql";
import { expect, it, vi } from "vitest";
import { setDefaultTrajectoryCapture } from "../../packages/agent/src/runtime/bootstrap/env/trajectory-capture";
import { PgliteMaintenanceService } from "../../packages/agent/src/runtime/bootstrap/runtime/pglite-maintenance";
import { createDeferred } from "../support/deferred";

it("keeps full trajectory capture opt-in while honoring SDK settings", () => {
  const local: NodeJS.ProcessEnv = {};
  const configured: NodeJS.ProcessEnv = { ELIZA_TRAJECTORY_RECORDING: "true" };
  const strict: NodeJS.ProcessEnv = { ELIZA_TRAJECTORY_STRICT: "enabled" };
  const production: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  const disabled: NodeJS.ProcessEnv = {
    ELIZA_TRAJECTORY_LOGGING: "true",
    ELIZA_DISABLE_TRAJECTORY_LOGGING: "1",
    ELIZA_TRAJECTORY_STRICT: "1",
  };

  for (const environment of [local, configured, strict, production, disabled]) {
    setDefaultTrajectoryCapture(environment);
  }
  expect(resolveTrajectoryGate(local)).toMatchObject({
    enabled: false,
    reason: "explicit-logging",
  });
  expect(resolveTrajectoryGate(configured)).toMatchObject({
    enabled: true,
    reason: "explicit-recording-legacy",
  });
  expect(resolveTrajectoryGate(strict)).toMatchObject({
    enabled: true,
    reason: "dev-default-on",
  });
  expect(resolveTrajectoryGate(production)).toMatchObject({
    enabled: false,
    reason: "production-opt-in",
  });
  expect(resolveTrajectoryGate(disabled)).toMatchObject({
    enabled: false,
    reason: "disable-flag",
  });
});

it("checkpoints a growing disk-backed WAL without losing stored rows", async () => {
  const directory = await mkdtemp(join(tmpdir(), "doolittle-wal-test-"));
  const agentId = randomUUID();
  try {
    const adapter = createDatabaseAdapter({ dataDir: directory }, agentId);
    try {
      if (!(adapter instanceof PgliteDatabaseAdapter)) {
        throw new Error("Expected the local PGlite adapter");
      }
      await adapter.initialize();
      const client = adapter.getRawConnection();
      const walDistance = async () => {
        const { rows } = await client.query<{ bytes: number }>(
          "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)::bigint AS bytes FROM pg_control_checkpoint()",
        );
        return Number(rows[0]?.bytes);
      };
      await client.exec("CREATE TABLE maintenance_probe (payload text)");
      await client.exec("CHECKPOINT");
      await client.exec(`
        INSERT INTO maintenance_probe
        SELECT (
          SELECT string_agg(md5(row_no::text || ':' || chunk_no::text), '')
          FROM generate_series(1, 4096) AS chunk_no
        )
        FROM generate_series(1, 160) AS row_no
      `);
      expect(await walDistance()).toBeGreaterThan(16 * 1024 * 1024);

      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      try {
        const runtime = {
          adapter,
        } as unknown as IAgentRuntime;
        const stoppingService = await PgliteMaintenanceService.start(runtime);
        const probe =
          createDeferred<Awaited<ReturnType<typeof client.query>>>();
        const query = vi
          .spyOn(client, "query")
          .mockImplementationOnce(() => probe.promise);
        const exec = vi.spyOn(client, "exec");
        try {
          await vi.advanceTimersByTimeAsync(30_000);
          expect(query).toHaveBeenCalledOnce();
          const stopping = stoppingService.stop();
          probe.resolve({ rows: [{ bytes: 24 * 1024 * 1024 }], fields: [] });
          await stopping;
          expect(exec).not.toHaveBeenCalled();
        } finally {
          query.mockRestore();
          exec.mockRestore();
          probe.resolve({ rows: [], fields: [] });
          await stoppingService.stop();
        }

        const service = await PgliteMaintenanceService.start(runtime);
        await vi.advanceTimersByTimeAsync(30_000);
        await service.stop();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
      expect(await walDistance()).toBeLessThan(1024 * 1024);
      const { rows } = await client.query(
        "SELECT count(*)::int AS rows FROM maintenance_probe",
      );
      expect(rows).toEqual([{ rows: 160 }]);
    } finally {
      await adapter.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
