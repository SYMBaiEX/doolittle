import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ["tests/integration/*.e2e.test.ts"],
    // Integration tests are latency-bound (PTY boots, render waits) rather than
    // CPU-bound, so they parallelize well. Kept at 1 historically because some
    // tests were timing-fragile under contention; rounds 16-18 hardened those
    // (condition-based waits, behavioral focus probes, type-ahead ordering).
    // Override with INTEGRATION_MAX_WORKERS for local tuning.
    maxWorkers: Number(process.env.INTEGRATION_MAX_WORKERS ?? 1),
  },
});
