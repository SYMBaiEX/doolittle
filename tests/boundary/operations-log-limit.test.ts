import { expect, it } from "vitest";
import type { AppContext } from "../../packages/agent/src/runtime/bootstrap/index";
import { handleOperationsRoutes } from "../../packages/agent/src/server/routes/operations";

it.each(["25garbage", "2.5", "1e2"])(
  "uses the default log page size for malformed limit %j",
  async (limit) => {
    const records = Array.from({ length: 250 }, (_, index) => ({
      id: String(index),
      message: `record ${index}`,
      level: "info",
      scope: "test",
    }));
    const context = {
      services: { logger: { list: () => records } },
    } as unknown as AppContext;

    const response = await handleOperationsRoutes(
      context,
      new Request(`http://localhost/logs?limit=${encodeURIComponent(limit)}`),
      new URL(`http://localhost/logs?limit=${encodeURIComponent(limit)}`),
    );

    expect(response?.status).toBe(200);
    const body = (await response?.json()) as { logs: typeof records };
    expect(body.logs).toHaveLength(200);
    expect(body.logs[0]?.id).toBe("50");
  },
);
