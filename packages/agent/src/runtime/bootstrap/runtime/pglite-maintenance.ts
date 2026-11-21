import { type IAgentRuntime, Service } from "@elizaos/core";
import { PgliteDatabaseAdapter } from "@elizaos/plugin-sql";

const CHECKPOINT_INTERVAL_MS = 30_000;
const CHECKPOINT_WAL_BYTES = 16 * 1024 * 1024;
const CHECKPOINT_DISTANCE =
  "SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), redo_lsn)::bigint AS bytes FROM pg_control_checkpoint()";

type PgliteClient = ReturnType<PgliteDatabaseAdapter["getRawConnection"]>;

/** PGlite's single-user server has no background checkpoint for disk profiles. */
export class PgliteMaintenanceService extends Service {
  static serviceType = "doolittle-pglite-maintenance";
  capabilityDescription = "Checkpoints the local ElizaOS database WAL.";
  private timer?: NodeJS.Timeout;
  private pending?: Promise<void>;

  static async start(
    runtime: IAgentRuntime,
  ): Promise<PgliteMaintenanceService> {
    const service = new PgliteMaintenanceService(runtime);
    const adapter = runtime.adapter;
    if (!(adapter instanceof PgliteDatabaseAdapter)) return service;
    const directory = adapter.getPgliteDataDir();
    if (!directory || directory === ":memory:" || directory.includes("://")) {
      return service;
    }
    service.timer = setInterval(() => {
      if (service.pending) return;
      service.pending = service
        .checkpoint(adapter.getRawConnection())
        .catch((error: unknown) => {
          runtime.logger.warn({ error }, "Local PGlite checkpoint failed");
        })
        .finally(() => {
          service.pending = undefined;
        });
    }, CHECKPOINT_INTERVAL_MS);
    service.timer.unref();
    return service;
  }

  private async checkpoint(client: PgliteClient): Promise<void> {
    if (!client.ready || client.closed) return;
    const { rows } = await client.query<{ bytes: bigint | number }>(
      CHECKPOINT_DISTANCE,
    );
    if (
      !this.timer ||
      client.closed ||
      Number(rows[0]?.bytes ?? 0) < CHECKPOINT_WAL_BYTES
    ) {
      return;
    }
    // PGlite's public exec holds the transaction mutex, so this command waits
    // for any active transaction and runs outside the preceding query.
    await client.exec("CHECKPOINT");
  }

  prepareStop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async stop(): Promise<void> {
    this.prepareStop();
    await this.pending;
  }
}
