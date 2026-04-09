import { describe, expect, it } from "bun:test";
import { resolveExecutionBodyDefaults } from "./body";

describe("bootstrap execution body helpers", () => {
  it("resolves the backend and browser defaults from environment and probes", () => {
    expect(
      resolveExecutionBodyDefaults(
        new Map([
          ["DOOLITTLE_EXECUTION_BACKEND", "ssh"],
          ["DOOLITTLE_BROWSER_PROVIDER", "lightpanda"],
        ]),
        [
          {
            key: "lightpanda",
            label: "Lightpanda",
            detail: "browser automation",
            installed: true,
          },
        ],
      ),
    ).toEqual({
      backend: "ssh",
      browser: "lightpanda",
    });
  });

  it("falls back to local and basic when the browser probe is unavailable", () => {
    expect(resolveExecutionBodyDefaults(new Map(), [])).toEqual({
      backend: "local",
      browser: "basic",
    });
  });
});
