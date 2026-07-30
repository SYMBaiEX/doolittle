import { describe, expect, it } from "vitest";
import { getNativeServices, type RuntimeLike } from "./runtime";

describe("getNativeServices", () => {
  it("reflects services loaded by deferred Eliza plugins", () => {
    const loaded = new Map<string, unknown>();
    const runtime = {
      getService(name: string) {
        return loaded.get(name) ?? null;
      },
    } as RuntimeLike;

    expect(getNativeServices(runtime).browser).toBeUndefined();

    const browser = { status: () => ({ ready: true }) };
    loaded.set("browser", browser);

    expect(getNativeServices(runtime).browser).toBe(browser);
  });
});
