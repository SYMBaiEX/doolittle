import { describe, expect, it } from "bun:test";
import { createShellPlugin } from ".";

interface ShellTestService {
  run(command: string): Promise<{ output: string }>;
  history(limit?: number): Array<{ command: string }>;
  status(): Promise<{
    configured: string;
    preview: {
      backend: string;
      ready: boolean;
      detail: string;
      command: string;
    };
    health: Array<{
      backend: string;
      mode: string;
      ready: boolean;
      detail: string;
    }>;
  }>;
  stop(): Promise<void>;
}

describe("createShellPlugin", () => {
  it("creates plugin descriptor and forwards terminal operations", async () => {
    const calls: string[] = [];
    const statusResult = {
      configured: "yes",
      preview: {
        backend: "terminal",
        ready: true,
        detail: "good",
        command: "sh",
      },
      health: [
        {
          backend: "terminal",
          mode: "local",
          ready: true,
          detail: "good",
        },
      ],
    };

    const plugin = createShellPlugin({
      terminal: {
        run(command: string) {
          calls.push(`run:${command}`);
          return Promise.resolve({ output: `ran:${command}` });
        },
        getHistory(limit = 20) {
          calls.push(`history:${limit}`);
          return [{ command: "echo" }];
        },
        status() {
          calls.push("status");
          return Promise.resolve(statusResult);
        },
      },
    });

    const shellServiceClass = plugin.services?.[0];
    const service = (await shellServiceClass?.start({} as never)) as
      | ShellTestService
      | undefined;

    expect(plugin.name).toBe("shell");
    expect(await service?.run("pwd")).toEqual({ output: "ran:pwd" });
    expect(service?.history(3)).toEqual([{ command: "echo" }]);
    expect(await service?.status()).toEqual(statusResult);
    expect(calls).toEqual(["run:pwd", "history:3", "status"]);
  });

  it("supports async execution and async status shape", async () => {
    const plugin = createShellPlugin({
      terminal: {
        run: async () => ({ output: "ok" }),
        getHistory: () => [],
        status: async () =>
          Promise.resolve({
            configured: "ok",
            preview: {
              backend: "shell",
              command: "true",
              ready: true,
              detail: "ok",
            },
            health: [],
          }),
      },
    });

    const serviceClass = plugin.services?.[0];
    const service = (await serviceClass?.start({} as never)) as
      | ShellTestService
      | undefined;
    expect(await service?.status()).toMatchObject({ configured: "ok" });
    expect(await service?.run("true")).toEqual({ output: "ok" });
    await expect(service?.stop()).resolves.toBeUndefined();
  });
});
