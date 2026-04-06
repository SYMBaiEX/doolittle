import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeGatewayRunnerPersistence } from "@/gateway/runner/persistence";
import type { AppContext } from "@/runtime/bootstrap";
import { DeliveryService } from "@/services/delivery-service";
import { GatewaySessionService } from "@/services/gateway-session-service";

describe("initializeGatewayRunnerPersistence", () => {
  it("creates snapshot and journal paths and hydrates journal-backed logs", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-gateway-persist-"));
    const config = {
      gatewayDataDir: join(root, "gateway"),
    } as AppContext["config"];
    const context = {
      config,
      services: {
        delivery: new DeliveryService(join(root, "delivery")),
        gatewaySessions: new GatewaySessionService(join(root, "sessions")),
      },
      runtime: {} as never,
    } as unknown as AppContext;

    try {
      const persistence = initializeGatewayRunnerPersistence(context);

      expect(existsSync(persistence.snapshotDir)).toBe(true);
      expect(existsSync(persistence.journalDir)).toBe(true);
      expect(existsSync(persistence.inboxPath)).toBe(true);
      expect(existsSync(persistence.outboxPath)).toBe(true);
      expect(existsSync(persistence.attachmentsPath)).toBe(true);
      expect(existsSync(persistence.supervisionPath)).toBe(true);
      expect(readFileSync(persistence.inboxPath, "utf8")).toBe("");
      expect(persistence.traceLog).toEqual([]);
      expect(persistence.inboxLog).toEqual([]);
      expect(persistence.outboxLog).toEqual([]);
      expect(persistence.attachmentLog).toEqual([]);
      expect(persistence.supervisionLog).toEqual([]);
      expect(persistence.historyView.snapshotWindow(5).deliveries).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
