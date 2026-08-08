import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import type {
  BrowserTarget,
  BrowserWorkspaceCommand,
} from "@elizaos/plugin-browser";
import { describe, expect, it, vi } from "vitest";
import type { AppServices } from "@/services";
import { createBrowserRuntimeService } from "./browser-service";
import { DOOLITTLE_BROWSER_TARGET_ID } from "./doolittle-browser-target";

describe("createBrowserRuntimeService", () => {
  it("exposes browser operations through one Eliza-owned service", async () => {
    const web = {
      status: vi.fn(async () => ({ ready: true })),
      fetchText: vi.fn(async (url: string) => ({ url, text: "page" })),
      inspect: vi.fn(async (url: string) => ({ page: { url } })),
      snapshot: vi.fn(async (url: string) => `${url}.md`),
      screenshot: vi.fn(async (url: string) => `${url}.png`),
      capture: vi.fn(async (url: string) => ({ page: { url } })),
      analyze: vi.fn(async (url: string) => ({ url, prompt: "analysis" })),
      compare: vi.fn(async (leftUrl: string, rightUrl: string) => ({
        leftUrl,
        rightUrl,
      })),
      analyzeComparison: vi.fn(async (leftUrl: string, rightUrl: string) => ({
        leftUrl,
        rightUrl,
        prompt: "comparison",
      })),
    };
    const Service = createBrowserRuntimeService({
      web,
    } as unknown as AppServices) as ServiceClass;
    let target: BrowserTarget | undefined;
    const browser = {
      registerTarget: vi.fn((next: BrowserTarget) => {
        target = next;
      }),
      unregisterTarget: vi.fn(() => true),
      execute: vi.fn(
        async (command: BrowserWorkspaceCommand, targetId?: string) => {
          expect(targetId).toBe(DOOLITTLE_BROWSER_TARGET_ID);
          if (!target) throw new Error("target not registered");
          return target.execute(command);
        },
      ),
    };
    const runtime = {
      getService: (serviceType: string) =>
        serviceType === "browser" ? browser : undefined,
    } as unknown as IAgentRuntime;
    const service = (await Service.start(runtime)) as Service & {
      status(): Promise<unknown>;
      fetch(url: string): Promise<unknown>;
      inspect(url: string): Promise<unknown>;
      snapshot(url: string): Promise<unknown>;
      screenshot(url: string): Promise<unknown>;
      capture(url: string): Promise<unknown>;
      analyze(url: string): Promise<unknown>;
      compare(leftUrl: string, rightUrl: string): Promise<unknown>;
      analyzeComparison(leftUrl: string, rightUrl: string): Promise<unknown>;
      stop(): Promise<void>;
    };

    expect(Service.serviceType).toBe(DOOLITTLE_BROWSER_SERVICE);
    expect(browser.registerTarget).toHaveBeenCalledOnce();
    expect(target?.id).toBe(DOOLITTLE_BROWSER_TARGET_ID);
    expect(
      target?.score?.({
        command: { subaction: "state" },
        env: {},
        mobile: false,
      }),
    ).toBeNull();
    await expect(service.status()).resolves.toEqual({ ready: true });
    await expect(service.fetch("https://a")).resolves.toEqual({
      url: "https://a",
      text: "page",
    });
    await expect(service.inspect("https://a")).resolves.toEqual({
      page: { url: "https://a" },
    });
    await expect(service.snapshot("https://a")).resolves.toBe("https://a.md");
    await expect(service.screenshot("https://a")).resolves.toBe(
      "https://a.png",
    );
    await expect(service.capture("https://a")).resolves.toEqual({
      page: { url: "https://a" },
    });
    await expect(service.analyze("https://a")).resolves.toMatchObject({
      prompt: "analysis",
    });
    await expect(service.compare("https://a", "https://b")).resolves.toEqual({
      leftUrl: "https://a",
      rightUrl: "https://b",
    });
    await expect(
      service.analyzeComparison("https://a", "https://b"),
    ).resolves.toMatchObject({ prompt: "comparison" });
    await service.stop();
    expect(browser.unregisterTarget).toHaveBeenCalledWith(
      DOOLITTLE_BROWSER_TARGET_ID,
    );
  });
});
