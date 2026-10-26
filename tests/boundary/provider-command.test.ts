import { expect, it } from "vitest";
import { runProviderCommand } from "../../packages/plugins/provider-transport/src/command";

it("preserves separate UTF-8 streams below the capture budget", async () => {
  const result = await runProviderCommand({
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write('héllo');process.stderr.write('diagnostic')",
    ],
    maxOutputBytes: 4096,
  });
  expect(result).toMatchObject({
    exitCode: 0,
    termination: "exit",
    stdout: "héllo",
    stderr: "diagnostic",
  });
});
for (const stream of ["stdout", "stderr"] as const) {
  it(`terminates excessive ${stream} without retaining an unbounded response`, async () => {
    const result = await runProviderCommand({
      command: process.execPath,
      args: [
        "-e",
        `setInterval(() => process.${stream}.write('é'.repeat(16_384)), 1)`,
      ],
      maxOutputBytes: 4096,
      timeoutMs: 5000,
    });
    expect(result.termination).toBe("output_limit");
    expect(result.exitCode).not.toBe(0);
    expect(Buffer.byteLength(result.stdout + result.stderr)).toBeLessThan(4352);
    expect(result.stderr).toContain("combined output exceeded");
  });
}
it("counts both output streams against one shared budget", async () => {
  const result = await runProviderCommand({
    command: process.execPath,
    args: [
      "-e",
      "process.stdout.write('a'.repeat(3000));process.stderr.write('b'.repeat(3000))",
    ],
    maxOutputBytes: 4096,
  });
  expect(result.termination).toBe("output_limit");
  expect(Buffer.byteLength(result.stdout + result.stderr)).toBeLessThan(4352);
});
it("rejects invalid capture budgets before starting a command", async () => {
  await expect(
    runProviderCommand({
      command: process.execPath,
      args: [],
      maxOutputBytes: Infinity,
    }),
  ).rejects.toThrow(/maxOutputBytes/);
});
