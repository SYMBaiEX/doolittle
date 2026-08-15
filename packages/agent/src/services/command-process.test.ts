import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runShellCommand } from "./command-process";

describe("command-process", () => {
  it("quotes argv values instead of interpolating them as shell syntax", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-command-process-"));
    const marker = join(root, "must-not-exist");
    const unsafeArgument = `'; touch '${marker}`;

    try {
      const result = await runShellCommand(
        process.execPath,
        ["-e", "process.stdout.write(process.argv[1])", unsafeArgument],
        5_000,
      );
      expect(result).toMatchObject({
        ok: true,
        stdout: unsafeArgument,
        exitCode: 0,
      });
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
