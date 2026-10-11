import { defineConfig } from "vitest/config";
import base from "./vitest.config.ts";

// Behavior, not source-text assertions: execution, cancellation, permissions,
// durable run receipts, transcript rollback, and shared mutation ownership.
export const essentialTests = [
  "packages/agent/src/services/process-execution.test.ts",
  "packages/agent/src/services/run-controller-service.test.ts",
  "packages/agent/src/services/run-controller/store.test.ts",
  "packages/agent/src/services/execution-approval-service.test.ts",
  "packages/agent/src/services/session/messages/store.test.ts",
  "packages/agent/src/utils/path-containment.test.ts",
  "apps/desktop/src/main/execution-admission.test.ts",
  "apps/desktop/src/main/ipc/computer-authorization.test.ts",
];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: essentialTests,
    // Bound transform/process pressure without disabling per-file isolation.
    maxWorkers: 4,
  },
});
