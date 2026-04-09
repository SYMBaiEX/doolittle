import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  GatewayMessageLike,
  GatewayTraceLike,
} from "../../../types/trajectory";
import { ingestTrajectoryGatewayHistory } from "./gateway-history";
import type { TrajectoryBundleStorageHost } from "./types";

describe("trajectory gateway ingress", () => {
  it("normalizes traces, inbox, and outbox into ordered trajectory records", () => {
    const root = mkdtempSync(
      join(tmpdir(), "doolittle-trajectory-gateway-history-"),
    );
    const host: TrajectoryBundleStorageHost = {
      baseDir: root,
      sessions: {
        recent() {
          return [];
        },
      },
      slug(value: string) {
        return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      },
    };

    const traces: GatewayTraceLike[] = [
      {
        at: "2026-03-20T00:00:02.000Z",
        kind: "received",
        platform: "slack",
        detail: "received from gateway",
      },
    ];
    const inbox: GatewayMessageLike[] = [
      {
        at: "2026-03-20T00:00:03.000Z",
        platform: "slack",
        status: "received",
        userId: "u-1",
      },
    ];
    const outbox: GatewayMessageLike[] = [
      {
        at: "2026-03-20T00:00:01.000Z",
        platform: "slack",
        status: "sent",
        text: "hello from assistant",
        roomId: "shared-room",
      },
    ];

    try {
      const bundle = ingestTrajectoryGatewayHistory(host, {
        label: "Gateway History Test",
        traces,
        inbox,
        outbox,
        purpose: "testing ingest",
      });

      expect(bundle.traceCount).toBe(1);
      expect(bundle.inboxCount).toBe(1);
      expect(bundle.outboxCount).toBe(1);
      expect(bundle.messageCount).toBe(3);
      expect(bundle.sessionCount).toBe(3);
      expect(readFileSync(bundle.summaryPath, "utf8")).toContain("Filters");

      const data = readFileSync(bundle.dataPath, "utf8")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { role: string; text: string });
      expect(data[0]?.role).toBe("assistant");
      expect(data[0]?.text).toContain("hello from assistant");
      expect(data[1]?.role).toBe("system");
      expect(data[1]?.text).toContain("received");
      expect(data[2]?.role).toBe("user");
      expect(data[2]?.text).toContain("received");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
