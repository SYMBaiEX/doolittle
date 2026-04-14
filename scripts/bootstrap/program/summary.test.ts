import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { printBootstrapSummary } from "./summary";
import type { OnboardingSummary } from "../types";

const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

const onboardingSummary: OnboardingSummary = {
  timestamp: "2026-04-13T12:00:00.000Z",
  mode: "ritual",
  theme: "blue",
  provider: "openai",
  accounts: {
    elizaCloudLinked: false,
    codexLinked: true,
    claudeCodeLinked: false,
  },
  backend: "local",
  browser: "lightpanda",
  agent: {
    runDepth: "deep",
    maxIterations: 12,
    toolProgressMode: "verbose",
  },
  transports: ["telegram"],
  tools: {
    mcp: true,
    acp: true,
    tts: false,
    codegen: true,
  },
  nativeOnboarding: {
    complete: true,
    currentStep: "done",
    summary: "Native alignment complete",
  },
  nativeConnection: {
    kind: "managed",
    provider: "openai",
    detail: "Ready",
  },
  profile: "pulse-alpha",
};

describe("printBootstrapSummary", () => {
  afterEach(() => {
    mock.restore();
  });

  it("prints the pulse summary with a first section and rendered sections", () => {
    const lines: string[] = [];
    const sections: Array<[string, string | undefined]> = [];
    const logSpy = spyOn(console, "log").mockImplementation((value?: unknown) => {
      lines.push(String(value ?? ""));
    });

    printBootstrapSummary({
      checkOnly: false,
      createdDirs: [".doolittle", ".doolittle/cache"],
      envMessages: ["DOOLITTLE_NAME updated", "OPENAI_API_KEY already present"],
      onboarding: onboardingSummary,
      section: (title, detail) => {
        sections.push([title, detail]);
      },
    });

    logSpy.mockRestore();

    expect(sections).toEqual([
      ["First Pulse", "I am configured enough to begin."],
    ]);

    const cleanLines = lines.map(stripAnsi);

    expect(cleanLines).toContain("  state: awake");
    expect(cleanLines).toContain("  channels: telegram");
    expect(cleanLines).toContain("What I Wrote");
    expect(cleanLines).toContain("  - .doolittle");
    expect(cleanLines).toContain("Runtime Bindings");
    expect(cleanLines).toContain("  - DOOLITTLE_NAME updated");
    expect(cleanLines).toContain("Next Moves");
    expect(cleanLines).toContain("  - /doctor");
  });
});
