import { describe, expect, it } from "vitest";
import {
  selectBackendLaunchTarget,
  sourceRootOverride,
} from "./runtime-target-policy";

const packagedRuntime = {
  executable: "electron",
  args: ["/resources/runtime/bin/doolittle-runtime.mjs", "api"],
  repoRoot: "/resources/runtime",
};
const sourceRuntime = {
  executable: "nub",
  args: ["packages/agent/src/index.ts", "api"],
  repoRoot: "/checkout",
};

describe("desktop runtime target policy", () => {
  it("honors source overrides only during development", () => {
    expect(sourceRootOverride(false, " /checkout ")).toBe("/checkout");
    expect(sourceRootOverride(true, "/checkout")).toBeUndefined();
  });

  it("always selects the resources runtime for packaged applications", () => {
    expect(
      selectBackendLaunchTarget({
        isPackaged: true,
        packagedRuntime,
        sourceRuntime,
      }),
    ).toBe(packagedRuntime);
  });

  it("refuses to fall back to a source checkout when packaged runtime is absent", () => {
    expect(() =>
      selectBackendLaunchTarget({
        isPackaged: true,
        packagedRuntime: null,
        sourceRuntime,
      }),
    ).toThrow("resources/runtime");
  });
});
