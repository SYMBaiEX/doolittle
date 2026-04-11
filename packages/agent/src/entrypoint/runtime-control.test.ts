import { describe, expect, it } from "bun:test";
import {
  resolveEntrypointCommandPlan,
  resolveEntrypointRuntimePlan,
} from "./runtime-control";

describe("resolveEntrypointCommandPlan", () => {
  it("classifies cockpit startup behavior", () => {
    expect(resolveEntrypointCommandPlan("cockpit")).toEqual({
      startupMode: "cli",
      eagerDeferredHydration: false,
      shouldUseCliSurface: true,
      shouldUseApiSurface: false,
      shouldUseCockpitSplash: true,
      shouldSetCliMode: true,
    });
  });
});

describe("resolveEntrypointRuntimePlan", () => {
  it("keeps api startup eager for api commands", () => {
    expect(
      resolveEntrypointRuntimePlan({
        command: "api",
        shellIsInteractive: false,
        mode: "both",
        stdinIsTTY: false,
      }),
    ).toMatchObject({
      shouldUseApiSurface: true,
      shouldStartApi: true,
      shouldStartApiImmediately: true,
      shouldStartCli: false,
      wantsApi: true,
      wantsCli: true,
    });
  });

  it("defers api startup until the shell is ready for interactive cli modes", () => {
    expect(
      resolveEntrypointRuntimePlan({
        command: "start",
        shellIsInteractive: true,
        mode: "both",
        stdinIsTTY: true,
      }),
    ).toMatchObject({
      shouldUseCliSurface: true,
      shouldStartCli: true,
      shouldStartApi: true,
      shouldStartApiImmediately: false,
      shouldCaptureBootLogs: true,
    });
  });
});
