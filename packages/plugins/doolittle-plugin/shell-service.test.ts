import type { AppServices } from "@doolittle/agent/plugin-api";
import { DOOLITTLE_SHELL_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { createShellRuntimeService } from "./shell-service";

describe("createShellRuntimeService", () => {
  it("exposes the product terminal through the canonical Eliza shell service", async () => {
    const run = vi.fn(async (command: string) => ({ command, exitCode: 0 }));
    const recent = vi.fn((limit: number) => [{ command: "pwd", limit }]);
    const status = vi.fn(async () => ({ configured: "local-shell" }));
    const disposeInteractiveSessions = vi.fn();
    const services = {
      terminal: {
        run,
        recent,
        status,
        disposeInteractiveSessions,
      },
    } as unknown as AppServices;
    const runtime = {} as IAgentRuntime;
    const Service = createShellRuntimeService(services) as ServiceClass;
    const service = (await Service.start(runtime)) as Service & {
      run(command: string): Promise<unknown>;
      history(limit?: number): unknown[];
      status(): Promise<unknown>;
    };

    expect(Service.serviceType).toBe(DOOLITTLE_SHELL_SERVICE);
    await expect(service.run("pwd")).resolves.toEqual({
      command: "pwd",
      exitCode: 0,
    });
    expect(service.history(3)).toEqual([{ command: "pwd", limit: 3 }]);
    await expect(service.status()).resolves.toEqual({
      configured: "local-shell",
    });

    await service.stop();
    expect(run).toHaveBeenCalledWith("pwd");
    expect(recent).toHaveBeenCalledWith(3);
    expect(status).toHaveBeenCalledTimes(1);
    expect(disposeInteractiveSessions).toHaveBeenCalledTimes(1);
  });
});
