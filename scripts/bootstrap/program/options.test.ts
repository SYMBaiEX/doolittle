import { describe, expect, it } from "bun:test";
import {
  formatBootstrapInstallerKeyLabel,
  resolveBootstrapOptions,
} from "./options";

describe("bootstrap program options", () => {
  it("forces headless mode for non-interactive shells", () => {
    expect(resolveBootstrapOptions([], false)).toEqual({
      checkOnly: false,
      headless: true,
      skipWizard: false,
      yes: false,
    });
  });

  it("preserves interactive mode unless explicit flags override it", () => {
    expect(resolveBootstrapOptions([], true)).toEqual({
      checkOnly: false,
      headless: false,
      skipWizard: false,
      yes: false,
    });
    expect(resolveBootstrapOptions(["--headless"], true).headless).toBe(true);
    expect(resolveBootstrapOptions(["--non-interactive"], true).headless).toBe(
      true,
    );
  });

  it("applies mac modifier labels without changing other text", () => {
    const formatted = formatBootstrapInstallerKeyLabel(
      "Alt-Enter then Ctrl-C to cancel",
    );
    expect(formatted === "Option-Enter then Control-C to cancel" || formatted === "Alt-Enter then Ctrl-C to cancel").toBe(
      true,
    );
  });
});
