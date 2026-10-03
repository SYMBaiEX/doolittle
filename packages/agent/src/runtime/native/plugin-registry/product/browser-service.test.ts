import { DOOLITTLE_BROWSER_SERVICE } from "@doolittle/contracts";
import type { IAgentRuntime, Service, ServiceClass } from "@elizaos/core";
import type {
  BrowserTarget,
  BrowserWorkspaceCommand,
} from "@elizaos/plugin-browser";
import { BrowserService as SdkBrowserService } from "@elizaos/plugin-browser";
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
    await expect(service.status()).resolves.toEqual({ ready: true });
    expect(browser.registerTarget).toHaveBeenCalledOnce();
    expect(target?.id).toBe(DOOLITTLE_BROWSER_TARGET_ID);
    expect(
      target?.score?.({
        command: { subaction: "state" },
        env: {},
        mobile: false,
      }),
    ).toBeNull();
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

  it("resolves the official browser lazily after parallel plugin startup", async () => {
    const Service = createBrowserRuntimeService({
      web: { status: vi.fn(async () => ({ ready: true })) },
    } as unknown as AppServices) as ServiceClass;
    const browser = {
      registerTarget: vi.fn(),
      unregisterTarget: vi.fn(() => true),
      execute: vi.fn(async () => ({ value: { ready: true } })),
    };
    const runtime = {
      getService: vi.fn(() => undefined),
      getServiceLoadPromise: vi.fn(async () => browser),
    } as unknown as IAgentRuntime;
    const service = (await Service.start(runtime)) as Service & {
      status(): Promise<unknown>;
      stop(): Promise<void>;
    };

    await expect(service.status()).resolves.toEqual({ ready: true });
    await expect(service.status()).resolves.toEqual({ ready: true });
    expect(runtime.getServiceLoadPromise).toHaveBeenCalledOnce();
    expect(browser.registerTarget).toHaveBeenCalledOnce();

    await service.stop();
    expect(browser.unregisterTarget).toHaveBeenCalledWith(
      DOOLITTLE_BROWSER_TARGET_ID,
    );
  });

  it("keeps concurrent analysis signals request-scoped through the public SDK dispatcher", async () => {
    const pending = new Map<string, () => void>();
    const web = {
      analyze: vi.fn(
        async (
          url: string,
          _focus: string,
          options: { abortSignal?: AbortSignal },
        ) => {
          await new Promise<void>((resolve) => pending.set(url, resolve));
          options.abortSignal?.throwIfAborted();
          return { url, prompt: "analysis" };
        },
      ),
      completeAnalysis: vi.fn(async (analysis: unknown) => analysis),
    };
    let browser: SdkBrowserService;
    const runtime = {
      getService: () => browser,
    } as unknown as IAgentRuntime;
    browser = new SdkBrowserService(runtime);
    const dispatch = vi.spyOn(browser, "execute");
    const Service = createBrowserRuntimeService({
      web,
    } as unknown as AppServices);
    const service = (await Service.start(runtime)) as Service & {
      analyze(url: string, signal?: AbortSignal): Promise<unknown>;
    };
    const cancelled = new AbortController();
    const active = new AbortController();
    const first = service.analyze("https://cancelled.test", cancelled.signal);
    const firstOutcome = first.catch((error: unknown) => error);
    const second = service.analyze("https://active.test", active.signal);
    await vi.waitFor(() => expect(pending.size).toBe(2));
    const calls = new Map(
      web.analyze.mock.calls.map(([url, , options]) => [
        url,
        options.abortSignal,
      ]),
    );
    expect(calls.get("https://cancelled.test")).toBe(cancelled.signal);
    expect(calls.get("https://active.test")).toBe(active.signal);
    expect(
      dispatch.mock.calls.map(([command]) => JSON.stringify(command)).sort(),
    ).toEqual([
      '{"subaction":"snapshot","name":"prepare-analysis","url":"https://active.test"}',
      '{"subaction":"snapshot","name":"prepare-analysis","url":"https://cancelled.test"}',
    ]);
    cancelled.abort(new Error("capture cancelled"));
    pending.get("https://cancelled.test")?.();
    pending.get("https://active.test")?.();
    expect(await firstOutcome).toEqual(new Error("capture cancelled"));
    await expect(second).resolves.toMatchObject({ url: "https://active.test" });
    expect(web.completeAnalysis).toHaveBeenCalledOnce();
    // Reusing a completed command must not inherit its old turn cancellation.
    const command = dispatch.mock.calls.find(
      ([item]) => item.url === "https://cancelled.test",
    )?.[0];
    if (!command) throw new Error("No observed SDK command");
    const replay = browser.execute(command, DOOLITTLE_BROWSER_TARGET_ID);
    await vi.waitFor(() => expect(web.analyze).toHaveBeenCalledTimes(3));
    expect(web.analyze.mock.calls[2]?.[2].abortSignal).toBeUndefined();
    pending.get("https://cancelled.test")?.();
    await expect(replay).resolves.toMatchObject({
      value: { prompt: "analysis" },
    });
    await service.stop();
    await browser.stop();
  });

  it("does not dispatch a pre-cancelled analysis", async () => {
    const web = { analyze: vi.fn(), completeAnalysis: vi.fn() };
    const getService = vi.fn();
    const Service = createBrowserRuntimeService({
      web,
    } as unknown as AppServices);
    const service = (await Service.start({
      getService,
    } as unknown as IAgentRuntime)) as Service & {
      analyze(url: string, signal?: AbortSignal): Promise<unknown>;
    };
    const controller = new AbortController();
    controller.abort();
    await expect(
      service.analyze("https://cancelled.test", controller.signal),
    ).rejects.toThrow();
    expect(getService).not.toHaveBeenCalled();
    expect(web.analyze).not.toHaveBeenCalled();
    expect(web.completeAnalysis).not.toHaveBeenCalled();
  });
});
