import { describe, expect, it } from "vitest";
import { getNativeServices, type RuntimeLike } from "./runtime";

describe("getNativeServices", () => {
  it("accepts a retired service id only for the Doolittle product shape", () => {
    const loaded = new Map<string, unknown>();
    const runtime = {
      getService(name: string) {
        return loaded.get(name) ?? null;
      },
    } as RuntimeLike;

    expect(getNativeServices(runtime).browser).toBeUndefined();

    const browser = {
      status: () => ({ ready: true }),
      fetch: async () => "",
      inspect: async () => ({}),
      snapshot: async () => "",
      screenshot: async () => "",
      capture: async () => ({}),
      analyze: async () => ({}),
      compare: async () => ({}),
      analyzeComparison: async () => ({}),
    };
    loaded.set("browser", browser);

    expect(getNativeServices(runtime).browser).toBe(browser);
  });

  it("does not treat an official browser service as the product projection", () => {
    const officialBrowser = {
      status: () => ({ ready: true }),
      dispatchCommand: async () => ({ ok: true }),
    };
    const runtime = {
      getService(name: string) {
        return name === "browser" ? officialBrowser : null;
      },
    } as RuntimeLike;

    expect(getNativeServices(runtime).browser).toBeUndefined();
  });
});
