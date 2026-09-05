import { describe, expect, it } from "vitest";
import {
  buildCockpitBootMessage,
  buildCockpitTipMessage,
  buildCockpitWelcomeMessage,
} from "@/cli/cockpit-chrome";

describe("cockpit chrome", () => {
  it("uses concise readiness and input copy", () => {
    expect(buildCockpitBootMessage("Doolittle")).toContain(
      "Doolittle is ready.",
    );
    expect(buildCockpitBootMessage("Doolittle")).not.toContain(
      "cockpit online",
    );
    expect(buildCockpitTipMessage()).toContain("multiline input");
    expect(buildCockpitTipMessage()).not.toContain("longform");
    expect(buildCockpitWelcomeMessage()).toContain("conversation");
    expect(buildCockpitWelcomeMessage()).toContain("transport status");
    expect(buildCockpitWelcomeMessage()).not.toContain("dialogue");
  });
});
