import { describe, expect, it } from "bun:test";
import {
  buildBootstrapCheckSummary,
  buildBootstrapPulseSummary,
} from "./summary";

describe("bootstrap summary builders", () => {
  it("builds the check summary with directories, probes, and env messages", () => {
    const summary = buildBootstrapCheckSummary({
      createdDirs: [".doolittle", "packages/skills/generated (exists)"],
      dependencyProbes: [
        { label: "Bun runtime", installed: true },
        { label: "Docker", installed: false },
      ],
      envMessages: [".env already exists"],
    });

    expect(summary).toContain("Doolittle bootstrap");
    expect(summary).toContain("- .doolittle");
    expect(summary).toContain("- Bun runtime: online");
    expect(summary).toContain("- Docker: missing");
    expect(summary).toContain("- .env already exists");
  });

  it("builds the awake summary with stable sections and fallbacks", () => {
    const summary = buildBootstrapPulseSummary({
      checkOnly: false,
      themeLabel: "Solarized",
      createdDirs: [".doolittle"],
      envMessages: ["DOOLITTLE_NAME updated"],
      onboarding: {
        mode: "ritual",
        theme: "solarized",
        provider: "openai",
        backend: "local",
        agent: {
          runDepth: "deep",
          maxIterations: 12,
          toolProgressMode: "verbose",
        },
        nativeOnboarding: {
          complete: true,
          currentStep: "done",
        },
        nativeConnection: {
          kind: "managed",
          provider: "openai",
        },
        accounts: {
          codexLinked: true,
          claudeCodeLinked: false,
        },
        transports: [],
        profile: "abc123",
      },
    });

    expect(summary.statusLines).toContain("state: awake");
    expect(summary.statusLines).toContain("skin: Solarized (solarized)");
    expect(summary.statusLines).toContain("channels: api, cli only");
    expect(summary.sections.map((section) => section.title)).toEqual([
      "What I Wrote",
      "Runtime Bindings",
      "Next Moves",
      "First Words",
    ]);
    expect(summary.sections[0]?.lines).toContain("- .doolittle");
    expect(summary.sections[1]?.lines).toContain("- DOOLITTLE_NAME updated");
  });
});
