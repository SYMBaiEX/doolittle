import { describe, expect, it } from "vitest";

import { LocalSandboxService } from "./service";

const runSandboxIntegration =
  process.env.DOOLITTLE_RUN_SANDBOX_INTEGRATION === "1";

describe.skipIf(!runSandboxIntegration)("local sandbox integration", () => {
  it("executes tools against shared files through the official SandboxManager", async () => {
    const service = await LocalSandboxService.start();

    try {
      await expect(
        service.executeCode(
          "from pathlib import Path; Path('alpha.txt').write_text('sandbox-ok'); print('python-ok')",
          "python",
        ),
      ).resolves.toMatchObject({ success: true, text: "python-ok" });
      await expect(
        service.executeCode(
          "console.log(require('node:fs').readFileSync('alpha.txt', 'utf8'))",
          "javascript",
        ),
      ).resolves.toMatchObject({ success: true, text: "sandbox-ok" });
      await expect(
        service.executeCode("console.log('typescript-ok')", "typescript"),
      ).resolves.toMatchObject({ success: true, text: "typescript-ok" });
      await expect(
        service.executeCode(
          'test "$(cat alpha.txt)" = sandbox-ok && echo bash-ok',
          "bash",
        ),
      ).resolves.toMatchObject({ success: true, text: "bash-ok" });
    } finally {
      await service.stop();
    }
  }, 60_000);
});
