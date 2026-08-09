import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { LocalSandboxService } from "./service";

const runSandboxIntegration =
  process.env.DOOLITTLE_RUN_SANDBOX_INTEGRATION === "1";

describe.skipIf(!runSandboxIntegration)("local sandbox integration", () => {
  it("executes tools against shared files through the official SandboxManager", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "doolittle-e2b-integration-"));
    const service = await LocalSandboxService.start(undefined, {
      rootDir,
      containerPrefix: `doolittle-e2b-integration-${crypto.randomUUID()}`,
    });

    try {
      const sandboxId = await service.createSandbox({ template: "python" });
      await expect(
        service.executeCode(
          "from pathlib import Path; Path('alpha.txt').write_text('sandbox-ok'); print('python-ok')",
          "python",
          sandboxId,
        ),
      ).resolves.toMatchObject({ success: true, text: "python-ok" });
      await expect(
        service.executeCode(
          "console.log(require('node:fs').readFileSync('alpha.txt', 'utf8'))",
          "javascript",
          sandboxId,
        ),
      ).resolves.toMatchObject({ success: true, text: "sandbox-ok" });
      await expect(
        service.executeCode(
          "console.log('typescript-ok')",
          "typescript",
          sandboxId,
        ),
      ).resolves.toMatchObject({ success: true, text: "typescript-ok" });
      await expect(
        service.executeCode(
          'test "$(cat alpha.txt)" = sandbox-ok && echo bash-ok',
          "bash",
          sandboxId,
        ),
      ).resolves.toMatchObject({ success: true, text: "bash-ok" });
    } finally {
      await service.stop();
      rmSync(rootDir, { recursive: true, force: true });
    }
  }, 60_000);
});
