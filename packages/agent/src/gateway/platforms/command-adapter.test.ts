import { describe, expect, it } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "@/services/delivery-service";
import { CommandPlatformAdapter } from "./command-adapter";

describe("CommandPlatformAdapter", () => {
  it("executes the configured shell command and records delivery metadata", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-command-adapter-"));
    const scriptPath = join(root, "send.sh");
    writeFileSync(
      scriptPath,
      [
        "#!/bin/sh",
        "set -eu",
        'printf \'sent:%s:%s\' "$DOOLITTLE_PLATFORM" "$DOOLITTLE_ROOM_ID"',
      ].join("\n"),
      "utf8",
    );
    chmodSync(scriptPath, 0o755);
    const delivery = new DeliveryService(join(root, "delivery"));
    const adapter = new CommandPlatformAdapter(
      "signal",
      delivery,
      scriptPath,
      "missing",
      "configured",
    );

    try {
      await adapter.start();
      const record = await adapter.send({
        roomId: "room-1",
        userId: "user-1",
        text: "hello",
      });
      const health = await adapter.health();

      expect(record.metadata?.commandStdout).toBe("sent:signal:room-1");
      expect(health.ready).toBe(true);
      expect(health.mode).toBe("native");
      expect(health.lastOutboundRoomId).toBe("room-1");
      expect(health.lastOutboundUserId).toBe("user-1");
      expect(health.lastOutboundMetadataKeys).toContain("commandStdout");
    } finally {
      await adapter.stop();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
