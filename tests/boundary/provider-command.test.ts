import { expect, it, vi } from "vitest";
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

for (const mode of ["cancel", "timeout"] as const) {
  it(`stops the provider launcher and its pipe-holding worker on ${mode}`, async () => {
    const { mkdtempSync, readFileSync, existsSync, rmSync } = await import(
      "node:fs"
    );
    const { tmpdir } = await import("node:os");
    const { resolve } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const root = mkdtempSync(resolve(tmpdir(), "doolittle-provider-tree-"));
    const pidFile = resolve(root, "worker.pid");
    const controller = new AbortController();
    const worker =
      "require('node:fs').writeFileSync(process.argv[1], String(process.pid));setInterval(() => process.stdout.write('.'), 25)";
    const launcher =
      "const {spawn}=require('node:child_process');require('node:fs').writeFileSync(process.argv[1]+'.root',String(process.pid));spawn(process.execPath,['-e',process.argv[2],process.argv[1]],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},1000)";
    const result = runProviderCommand({
      command: process.execPath,
      args: ["-e", launcher, pidFile, worker],
      signal: controller.signal,
      timeoutMs: mode === "timeout" ? 3000 : 10_000,
    }).then(
      (value) => ({ value, error: undefined }),
      (error: Error) => ({ value: undefined, error }),
    );
    const pids: number[] = [];
    const running = (pid: number) => {
      try {
        process.kill(pid, 0);
      } catch {
        return false;
      }
      if (process.platform === "win32") return true;
      // Orphan zombies cannot execute or hold pipes, but may await the CI init reaper.
      const status = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], {
        encoding: "utf8",
      }).stdout.trim();
      return Boolean(status) && !status.startsWith("Z");
    };
    try {
      await expect
        .poll(() => existsSync(pidFile), { timeout: 8000 })
        .toBe(true);
      pids.push(
        Number(readFileSync(`${pidFile}.root`, "utf8")),
        Number(readFileSync(pidFile, "utf8")),
      );
      if (mode === "cancel") controller.abort();
      const ended = await result;
      if (mode === "cancel") expect(ended.error?.name).toBe("AbortError");
      else expect(ended.value?.termination).toBe("timeout");
      for (const pid of pids)
        await expect.poll(() => running(pid), { timeout: 3000 }).toBe(false);
    } finally {
      controller.abort();
      await result;
      for (const path of [`${pidFile}.root`, pidFile]) {
        if (!existsSync(path)) continue;
        const pid = Number(readFileSync(path, "utf8"));
        if (Number.isSafeInteger(pid) && pid > 0 && running(pid)) {
          try {
            process.kill(pid, "SIGKILL");
          } catch {
            /* already exited */
          }
        }
      }
      rmSync(root, { recursive: true, force: true });
    }
  });
}

it("cancels a Devin model request through its linked provider transport", async () => {
  const { runDevinTextGeneration } = await import(
    "../../packages/plugins/plugin-devin/src/generate"
  );
  const controller = new AbortController();
  const request = runDevinTextGeneration(
    {
      getSetting: () => JSON.stringify({ model: { provider: "devin" } }),
    } as unknown as import("@elizaos/core").IAgentRuntime,
    { prompt: "Cancellation fixture", signal: controller.signal },
    {
      getStatus: () => ({
        provider: "devin",
        available: true,
        reusable: true,
        detail: "fixture",
      }),
      invokeCliPrint: async (params) => {
        const result = await runProviderCommand({
          command: process.execPath,
          args: ["-e", "setInterval(()=>{}, 1000)"],
          signal: params.signal,
          timeoutMs: 3000,
        });
        return result.stdout;
      },
    },
  );
  const assertion = expect(request).rejects.toMatchObject({
    code: "cancelled",
  });
  controller.abort();
  await assertion;
});

it("reports an unsuccessful tree termination instead of claiming cancellation succeeded", async () => {
  const controller = new AbortController();
  const previousRoot = process.env.SystemRoot;
  const kill =
    process.platform === "win32"
      ? undefined
      : vi.spyOn(process, "kill").mockImplementation(() => {
          throw Object.assign(new Error("forced termination failure"), {
            code: "EPERM",
          });
        });
  try {
    const request = runProviderCommand({
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      signal: controller.signal,
    });
    const rejected = expect(request).rejects.toThrow(
      "could not terminate its process tree",
    );
    if (process.platform === "win32") process.env.SystemRoot = "invalid";
    controller.abort();
    await rejected;
  } finally {
    kill?.mockRestore();
    if (previousRoot === undefined) delete process.env.SystemRoot;
    else process.env.SystemRoot = previousRoot;
  }
});
