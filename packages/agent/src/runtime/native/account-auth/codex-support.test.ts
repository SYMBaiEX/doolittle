import { describe, expect, it } from "bun:test";
import { getCodexAuthDependencies } from "./codex-support";

describe("codex auth support helpers", () => {
  it("builds a complete dependency bag for codex auth flows", () => {
    const deps = getCodexAuthDependencies();

    expect(deps.defaultRefreshSkewSeconds).toBeGreaterThan(0);
    expect(typeof deps.resolveHome).toBe("function");
    expect(typeof deps.commandExists).toBe("function");
    expect(typeof deps.readCommandText).toBe("function");
    expect(typeof deps.readJson).toBe("function");
    expect(typeof deps.writeJson).toBe("function");
    expect(typeof deps.getStoredCodexCredentials).toBe("function");
    expect(typeof deps.persistProviderCredentials).toBe("function");
    expect(typeof deps.decodeJwtPayload).toBe("function");
    expect(typeof deps.isUnixSecondsExpiring).toBe("function");
  });
});
