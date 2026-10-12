import { describe, expect, it } from "vitest";
import type { BackendState } from "../../shared/contracts";
import {
  effectiveRunHydration,
  type RunHydrationScope,
} from "./run-hydration-scope";

const backend: BackendState = {
  phase: "ready",
  agentId: "lead",
  message: "ready",
};
const scope: RunHydrationScope = {
  backend,
  workspacePath: "/workspace/a",
  botIds: "bot-a,bot-b",
  defaultBotId: "lead",
  sessionOwners: '[["session-a","bot-a"]]',
  retry: 0,
};

describe("run hydration context", () => {
  it("closes a stale ready gate immediately when context changes before effects", () => {
    const ready = { scope, status: "ready" as const };
    expect(effectiveRunHydration(ready, scope)).toBe("ready");
    expect(
      effectiveRunHydration(ready, { ...scope, workspacePath: "/workspace/b" }),
    ).toBe("checking");
    expect(
      effectiveRunHydration(ready, {
        ...scope,
        backend: { ...backend, phase: "degraded" },
      }),
    ).toBe("checking");
    expect(
      effectiveRunHydration(ready, { ...scope, backend: { ...backend } }),
    ).toBe("checking");
    expect(effectiveRunHydration(ready, { ...scope, retry: 1 })).toBe(
      "checking",
    );
    expect(effectiveRunHydration(ready, { ...scope, botIds: "bot-b" })).toBe(
      "checking",
    );
    expect(
      effectiveRunHydration(ready, {
        ...scope,
        sessionOwners: '[["session-a","bot-b"]]',
      }),
    ).toBe("checking");
    expect(
      effectiveRunHydration(ready, {
        ...scope,
        backend: { ...backend, agentId: "other" },
      }),
    ).toBe("checking");
  });

  it("lets independently mounted panes share the same completed whole-roster inventory", () => {
    const coordinator = { ...scope };
    const leftPane = { ...scope };
    const rightPane = { ...scope };
    const ready = { scope: coordinator, status: "ready" as const };
    expect(effectiveRunHydration(ready, leftPane)).toBe("ready");
    expect(effectiveRunHydration(ready, rightPane)).toBe("ready");
  });

  it("blocks only a failed owner and restores it after a successful retry", () => {
    const partial = {
      scope,
      status: "ready" as const,
      failedBotIds: ["bot-b"],
    };
    expect(effectiveRunHydration(partial, scope, "bot-a")).toBe("ready");
    expect(effectiveRunHydration(partial, scope, "bot-b")).toBe("unavailable");
    expect(
      effectiveRunHydration(partial, { ...scope, retry: 1 }, "bot-b"),
    ).toBe("checking");
    const recovered = {
      scope: { ...scope, retry: 1 },
      status: "ready" as const,
      failedBotIds: [],
    };
    expect(effectiveRunHydration(recovered, recovered.scope, "bot-b")).toBe(
      "ready",
    );
  });
});
