import { describe, expect, it } from "bun:test";
import type { CodexBondAccounts } from "./codex-defaults";
import { resolveCodexBondDefault } from "./codex-defaults";

describe("resolveCodexBondDefault", () => {
  it("prefers login until native auth is already ready", () => {
    const notReady: CodexBondAccounts = {
      codex: {
        nativeReady: false,
      },
    };

    const ready = {
      ...notReady,
      codex: {
        ...notReady.codex,
        nativeReady: true,
        reusable: true,
      },
    };

    expect(resolveCodexBondDefault(notReady)).toBe("login");
    expect(resolveCodexBondDefault(ready)).toBe("skip");
  });
});
