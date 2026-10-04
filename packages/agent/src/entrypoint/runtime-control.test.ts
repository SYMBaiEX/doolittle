import { describe, expect, it } from "vitest";
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

  it.each(["status", "progress", "tools", "skills", "runtime"] as const)(
    "loads the CLI surface for the %s alias",
    (command) => {
      expect(resolveEntrypointCommandPlan(command)).toMatchObject({
        startupMode: "cli",
        eagerDeferredHydration: false,
        shouldUseCliSurface: true,
        shouldUseApiSurface: false,
        shouldSetCliMode: true,
      });
    },
  );
});

describe("resolveEntrypointRuntimePlan", () => {
  it.each(["exec", "status", "start"] as const)(
    "uses only the owned endpoint for a %s one-shot even in both mode",
    (command) => {
      expect(
        resolveEntrypointRuntimePlan({
          command,
          shellIsInteractive: false,
          mode: "both",
          stdinIsTTY: false,
          immediatePrompt: "real prompt",
        }),
      ).toMatchObject({
        shouldStartApi: false,
        shouldStartApiImmediately: false,
      });
    },
  );
  it("preserves empty noninteractive start API behavior", () => {
    expect(
      resolveEntrypointRuntimePlan({
        command: "start",
        shellIsInteractive: false,
        mode: "both",
        stdinIsTTY: false,
      }),
    ).toMatchObject({ shouldStartApi: true });
  });
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
