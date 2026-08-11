import { describe, expect, it } from "vitest";
import { runtimeResourcePolicy } from "./models";

describe("runtime resource policy", () => {
  it("loads only the visible runtime section", () => {
    expect(runtimeResourcePolicy("overview", true)).toEqual({
      runtime: true,
      accountPool: true,
      autonomy: true,
      gatewayHealth: false,
      gatewayRuntime: false,
      plugins: false,
      ecosystem: false,
      insights: false,
    });
    expect(runtimeResourcePolicy("gateway", true)).toMatchObject({
      runtime: false,
      accountPool: false,
      autonomy: false,
      gatewayHealth: true,
      gatewayRuntime: true,
    });
    expect(runtimeResourcePolicy("inventory", true)).toMatchObject({
      gatewayHealth: false,
      gatewayRuntime: false,
      plugins: true,
      ecosystem: true,
      insights: true,
    });
  });

  it("disables every resource when the route is inactive", () => {
    expect(Object.values(runtimeResourcePolicy("overview", false))).toEqual(
      Array.from({ length: 8 }, () => false),
    );
  });
});
