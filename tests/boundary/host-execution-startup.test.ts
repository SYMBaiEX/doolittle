import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("captures CLI host execution authority before mutable runtime environment changes", () => {
  const root = mkdtempSync(join(tmpdir(), "doolittle-host-authority-"));
  const outside = join(root, "untrusted-executable");
  writeFileSync(outside, "untrusted", { mode: 0o755 });
  try {
    const script = `
      import assert from 'node:assert/strict';
      import {createRequire} from 'node:module';
      await import(${JSON.stringify(pathToFileURL(resolve("apps/cli/src/entrypoint/host-execution.ts")).href)});
      const require = createRequire(${JSON.stringify(resolve("apps/cli/package.json"))});
      const host = await import(require.resolve('@elizaos/host'));
      const {runShell} = await import(require.resolve('@elizaos/agent/services/shell-execution-router'));
      process.env.PATH = ${JSON.stringify(root)};
      assert.equal(host.resolveHostExecutable(${JSON.stringify(outside)}), undefined);
      const result = await runShell({command:process.execPath,args:['-e','process.stdout.write("HOST_AUTHORITY_OK")'],toolName:'fixture.host-authority'}, {mode:'local-yolo'});
      assert.equal(result.exitCode,0);
      assert.equal(result.stdout,'HOST_AUTHORITY_OK');
      console.log('SDK_HOST_BASELINE_OK');
    `;
    expect(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], {
        cwd: process.cwd(),
        encoding: "utf8",
        timeout: 10000,
        env: {
          PATH: dirname(process.execPath),
          HOME: root,
          USERPROFILE: root,
          ...(process.env.SystemRoot
            ? { SystemRoot: process.env.SystemRoot }
            : {}),
        },
      }),
    ).toContain("SDK_HOST_BASELINE_OK");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
