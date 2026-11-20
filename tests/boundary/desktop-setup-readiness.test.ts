import { describe, expect, it } from "vitest";
import { normalizeSetupReadiness } from "../../apps/desktop/src/renderer/setup/setup-model";

describe("desktop setup provider recovery", () => {
  const readiness = { level: "blocked", headline: "Setup is blocked" };

  it("offers provider setup when the runtime confirms no ready provider", () => {
    expect(
      normalizeSetupReadiness({
        summary: { readiness, providers: [{ ready: false }] },
      }),
    ).toMatchObject({ needsModelProvider: true });
  });

  it("leaves other blockers alone when a provider is ready or inventory is missing", () => {
    for (const providers of [undefined, [{ ready: true }]]) {
      expect(
        normalizeSetupReadiness({ summary: { readiness, providers } }),
      ).toMatchObject({ needsModelProvider: false });
    }
  });
});
