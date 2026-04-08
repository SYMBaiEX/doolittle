import { describe, expect, it } from "bun:test";
import { parseAgentObservation, parseUserObservation } from "./observation";

describe("user-profile observation helpers", () => {
  it("extracts user observation signals from conversational text", () => {
    const signals = parseUserObservation(
      "You can call me AJ. I want to ship the Docker backend. I usually use Bun with Docker and Lightpanda. I work best with concise updates. Please remember this.",
    );

    expect(signals.alias).toBe("AJ");
    expect(signals.goal).toContain("ship the Docker backend");
    expect(signals.toolSignals).toContain("Bun");
    expect(signals.toolSignals).toContain("Docker");
    expect(signals.toolSignals).toContain("Lightpanda");
    expect(signals.workStyle).toContain("concise updates");
    expect(signals.isExplicitMemory).toBe(true);
  });

  it("extracts agent observation signals from labeled notes", () => {
    expect(
      parseAgentObservation("goal: keep Doolittle native and operator-friendly")
        .goal,
    ).toContain("Doolittle native");
    expect(
      parseAgentObservation(
        "strength: strong Bun and TypeScript execution flows",
      ).strength,
    ).toContain("TypeScript execution");
    expect(
      parseAgentObservation("style: calm, direct, and technical").workStyle,
    ).toContain("direct");
  });
});
