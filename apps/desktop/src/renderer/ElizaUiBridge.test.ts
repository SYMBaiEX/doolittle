import { describe, expect, it } from "vitest";
import { elizaEnglishFallbackTranslator } from "./ElizaUiBridge";

describe("Eliza UI English fallback translator", () => {
  it("uses component defaults and interpolates Doolittle values", () => {
    expect(
      elizaEnglishFallbackTranslator("accounts.add.title", {
        defaultValue: "Connect {{appName}} to {{provider}}",
        provider: "Codex",
      }),
    ).toBe("Connect Doolittle to Codex");
  });

  it("returns the key when no usable default is supplied", () => {
    expect(elizaEnglishFallbackTranslator("accounts.unknown")).toBe(
      "accounts.unknown",
    );
    expect(
      elizaEnglishFallbackTranslator("accounts.unknown", {
        defaultValue: "  ",
      }),
    ).toBe("accounts.unknown");
  });
});
