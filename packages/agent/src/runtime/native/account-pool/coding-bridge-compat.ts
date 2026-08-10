const CODING_AGENT_SELECTOR_BRIDGE_SYMBOL = Symbol.for(
  "eliza.account-pool.coding-agent.v1",
);

type GlobalBridgeSlot = Record<symbol, unknown>;

export interface CodingBridge {
  describe(): unknown;
  select(
    agentType: string,
    options?: { strategy?: string; [key: string]: unknown },
  ): Promise<unknown>;
  markRateLimited(...args: unknown[]): Promise<void>;
  markNeedsReauth(...args: unknown[]): Promise<void>;
  recordUsage(...args: unknown[]): Promise<void>;
}

interface OfficialCodingBridgeAccessors {
  getCodingAgentSelectorBridge?: () => CodingBridge | null;
  setCodingAgentSelectorBridge?: (bridge: CodingBridge | null) => void;
}

function officialAccessors(core: unknown): OfficialCodingBridgeAccessors {
  return core && typeof core === "object"
    ? (core as OfficialCodingBridgeAccessors)
    : {};
}

export function hasOfficialCodingAgentBridgeAccessors(core: unknown): boolean {
  const accessors = officialAccessors(core);
  return (
    typeof accessors.getCodingAgentSelectorBridge === "function" &&
    typeof accessors.setCodingAgentSelectorBridge === "function"
  );
}

function globalBridgeSlot(): GlobalBridgeSlot | null {
  return typeof globalThis === "undefined"
    ? null
    : (globalThis as GlobalBridgeSlot);
}

/**
 * Prefer Eliza's public bridge accessors when the installed SDK exposes them.
 * beta.7 predates those exports, so its exact global symbol remains the narrow
 * fallback until the repository can raise its minimum Eliza version.
 */
export function getCodingAgentBridge(core: unknown): CodingBridge | null {
  const accessors = officialAccessors(core);
  if (typeof accessors.getCodingAgentSelectorBridge === "function") {
    return accessors.getCodingAgentSelectorBridge();
  }
  return (
    (globalBridgeSlot()?.[CODING_AGENT_SELECTOR_BRIDGE_SYMBOL] as
      | CodingBridge
      | null
      | undefined) ?? null
  );
}

export function setCodingAgentBridge(
  core: unknown,
  bridge: CodingBridge | null,
): void {
  const accessors = officialAccessors(core);
  if (typeof accessors.setCodingAgentSelectorBridge === "function") {
    accessors.setCodingAgentSelectorBridge(bridge);
    return;
  }
  const slot = globalBridgeSlot();
  if (!slot) return;
  if (bridge) slot[CODING_AGENT_SELECTOR_BRIDGE_SYMBOL] = bridge;
  else delete slot[CODING_AGENT_SELECTOR_BRIDGE_SYMBOL];
}
