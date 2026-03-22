import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeliveryService } from "@/services/delivery-service";
import type { EnvConfig } from "@/types";
import { HomeAssistantPlatformAdapter } from "./homeassistant-adapter";

describe("HomeAssistantPlatformAdapter", () => {
  it("watches Home Assistant state and records the latest cycle", async () => {
    const root = mkdtempSync(join(tmpdir(), "eliza-agent-homeassistant-"));
    const delivery = new DeliveryService(join(root, "delivery"));
    const config = {
      homeAssistantUrl: "https://homeassistant.local",
      homeAssistantToken: "token",
    } as EnvConfig;
    const adapter = new HomeAssistantPlatformAdapter(
      "homeassistant",
      config,
      delivery,
    );
    const originalFetch = globalThis.fetch;

    const mockFetch = Object.assign(
      async (input: RequestInfo | URL) => {
        const url = new URL(
          typeof input === "string" || input instanceof URL
            ? input.toString()
            : input.url,
        );
        if (url.pathname === "/api/states") {
          return new Response(
            JSON.stringify([
              { entity_id: "light.kitchen", state: "on" },
              { entity_id: "sensor.temperature", state: "22.4" },
            ]),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (url.pathname === "/api/services/notify/eliza_agent") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response("not found", { status: 404 });
      },
      {
        preconnect: originalFetch.preconnect.bind(originalFetch),
      },
    );
    globalThis.fetch = mockFetch;

    try {
      await adapter.start();
      const result = await adapter.watch("manual");
      const health = await adapter.health();

      expect(result.count).toBe(2);
      expect(result.summary).toContain("2 Home Assistant states");
      expect(health.lastWatchCount).toBe(2);
      expect(health.lastWatchSummary).toContain("2 Home Assistant states");
      expect(health.events.some((event) => event.kind === "heartbeat")).toBe(
        true,
      );
      expect(health.ready).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
