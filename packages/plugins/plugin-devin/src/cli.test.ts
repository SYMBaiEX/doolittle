import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { invokeDevinCliPrint } from "./cli";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("invokeDevinCliPrint", () => {
  it("keeps the prompt file available until the CLI process exits", async () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-devin-cli-test-"));
    roots.push(root);
    const command = join(root, "fake-devin");
    writeFileSync(
      command,
      [
        "#!/usr/bin/env node",
        "const { readFile } = await import('node:fs/promises');",
        "const index = process.argv.indexOf('--prompt-file');",
        "const promptFile = process.argv[index + 1];",
        "await new Promise((resolve) => setTimeout(resolve, 25));",
        "console.log(await readFile(promptFile, 'utf8'));",
      ].join("\n"),
      "utf8",
    );
    chmodSync(command, 0o755);

    await expect(
      invokeDevinCliPrint({
        command,
        model: "swe-1-6-fast",
        prompt: "PROMPT_FILE_STILL_THERE",
        timeoutMs: 10_000,
      }),
    ).resolves.toBe("PROMPT_FILE_STILL_THERE");
  });
});
