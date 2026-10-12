import { defineConfig } from "vitest/config";
import base, { essentialTests } from "./vitest.essential.config.ts";

// Release-critical unit boundaries beyond the routine eight-file feedback loop.
// Real process, Electron, and packaged-app behavior has separate E2E gates.
export const releaseTests = [
  ...essentialTests,
  "packages/contracts/src/bot-character.test.ts",
  "packages/agent/src/runtime/bootstrap/bot-profile.test.ts",
  "apps/desktop/src/main/bot-process-registry.test.ts",
  "apps/desktop/src/main/bot-session-routing.test.ts",
  "apps/desktop/src/main/worker-host-rpc.test.ts",
  "packages/agent/src/runtime/bootstrap/worker-host-rpc.test.ts",
  "packages/agent/src/server/auth.test.ts",
  "packages/agent/src/server/routes/knowledge-broker.test.ts",
  "apps/desktop/src/main/bot-knowledge-broker.test.ts",
  "apps/desktop/src/renderer/components/InlineApprovalPanel.test.tsx",
  "apps/desktop/src/renderer/bots/run-inventory.test.ts",
  "apps/desktop/src/renderer/chat/run-hydration-scope.test.ts",
  "apps/desktop/src/renderer/session-workspace/SessionWorkspace.test.tsx",
  "scripts/check-workflow-security.test.ts",
];

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: releaseTests,
  },
});
