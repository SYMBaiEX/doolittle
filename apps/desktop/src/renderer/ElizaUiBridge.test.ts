import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ElizaUiBridge, elizaEnglishFallbackTranslator } from "./ElizaUiBridge";

describe("ElizaUiBridge", () => {
  it("stores the fallback translator without invoking it as a state initializer", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ElizaUiBridge,
        null,
        createElement("span", null, "Bridge ready"),
      ),
    );

    expect(markup).toContain("Bridge ready");
  });
});

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
