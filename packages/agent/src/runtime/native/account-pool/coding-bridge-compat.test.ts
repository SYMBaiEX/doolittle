import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type CodingBridge,
  getCodingAgentBridge,
  hasOfficialCodingAgentBridgeAccessors,
  setCodingAgentBridge,
} from "./coding-bridge-compat";

const bridgeSymbol = Symbol.for("eliza.account-pool.coding-agent.v1");

function createBridge(): CodingBridge {
  return {
    describe: () => ({}),
    select: vi.fn().mockResolvedValue(null),
    markRateLimited: vi.fn().mockResolvedValue(undefined),
    markNeedsReauth: vi.fn().mockResolvedValue(undefined),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  };
}

describe("coding account bridge compatibility", () => {
  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[bridgeSymbol];
  });

  it("uses the public Eliza accessors when they are available", () => {
    const legacyBridge = createBridge();
    const officialBridge = createBridge();
    const nextBridge = createBridge();
    const setBridge = vi.fn();
    (globalThis as Record<symbol, unknown>)[bridgeSymbol] = legacyBridge;

    const core = {
      getCodingAgentSelectorBridge: () => officialBridge,
      setCodingAgentSelectorBridge: setBridge,
    };

    expect(getCodingAgentBridge(core)).toBe(officialBridge);
    expect(hasOfficialCodingAgentBridgeAccessors(core)).toBe(true);
    setCodingAgentBridge(core, nextBridge);
    expect(setBridge).toHaveBeenCalledWith(nextBridge);
    expect((globalThis as Record<symbol, unknown>)[bridgeSymbol]).toBe(
      legacyBridge,
    );
  });

  it("falls back to beta.7's exact global symbol", () => {
    const bridge = createBridge();

    setCodingAgentBridge({}, bridge);
    expect(hasOfficialCodingAgentBridgeAccessors({})).toBe(false);
    expect(getCodingAgentBridge({})).toBe(bridge);

    setCodingAgentBridge({}, null);
    expect(getCodingAgentBridge({})).toBeNull();
  });
});
