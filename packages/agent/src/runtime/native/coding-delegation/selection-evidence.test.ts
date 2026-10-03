import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { initialSelectionEvidence } from "./selection-evidence";
import type { AcpSession } from "./types";

const model = "gpt-6-luna";
const observation = (changes: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  source: "acp-session-new",
  state: "reported",
  commandProvenance: "configured-command-1.13.1",
  config: { model, reasoningEffort: "medium" },
  legacyModelId: null,
  ...changes,
});
const session = (value?: unknown): AcpSession => ({
  sessionId: "exact-child",
  agentType: "codex",
  workdir: "/unused",
  status: "ready",
  initialModelSelection: value,
});

describe("adapter initial selection evidence", () => {
  it("hashes config-only selection and freezes the snapshot without raw values", () => {
    const value = observation();
    const result = initialSelectionEvidence(session(value));
    expect(result).toMatchObject({
      state: "reported",
      source: "acp-session-new-config-options",
      reasoningEffort: "medium",
      effectiveExecution: "unavailable",
    });
    expect(result.modelSha256).toBe(
      createHash("sha256").update(model).digest("hex"),
    );
    expect(JSON.stringify(result)).not.toContain(model);
    expect(Object.isFrozen(result)).toBe(true);
    value.config = { model: "later-model", reasoningEffort: "high" };
    expect(result.reasoningEffort).toBe("medium");
  });
  it("accepts sole pinned-command legacy state, never an unverified legacy format", () => {
    expect(
      initialSelectionEvidence(
        session(
          observation({ config: null, legacyModelId: `${model}[medium]` }),
        ),
      ),
    ).toMatchObject({
      state: "reported",
      source: "acp-session-new-legacy-model-state",
      reasoningEffort: "medium",
    });
    expect(
      initialSelectionEvidence(
        session(
          observation({
            config: null,
            legacyModelId: `${model}[medium]`,
            commandProvenance: "unverified",
          }),
        ),
      ),
    ).toMatchObject({ state: "unavailable", modelSha256: null });
  });
  it("cross-checks agreement but does not fill missing config effort from legacy", () => {
    const agreed = initialSelectionEvidence(
      session(observation({ legacyModelId: `${model}[medium]` })),
    );
    expect(agreed).toEqual(initialSelectionEvidence(session(observation())));
    expect(
      initialSelectionEvidence(
        session(
          observation({
            config: { model, reasoningEffort: null },
            legacyModelId: `${model}[medium]`,
          }),
        ),
      ),
    ).toMatchObject({ state: "reported", reasoningEffort: null });
  });
  it.each(["other-model[medium]", `${model}[high]`])(
    "excludes contradictory legacy %s",
    (legacyModelId) => {
      expect(
        initialSelectionEvidence(session(observation({ legacyModelId }))),
      ).toMatchObject({
        state: "conflicting",
        modelSha256: null,
        selectionSha256: null,
        reasoningEffort: null,
      });
    },
  );
  it.each([
    observation({ state: "rejected" }),
    observation({ state: "truncated" }),
    observation({ schemaVersion: 2 }),
    observation({ source: "caller-settings" }),
    observation({ config: { model, reasoningEffort: "ultra" } }),
    observation({ config: { model: "bad\nmodel", reasoningEffort: "medium" } }),
    observation({
      config: { model: "a".repeat(161), reasoningEffort: "medium" },
    }),
    observation({ config: { model: null, reasoningEffort: "medium" } }),
    observation({ config: null, legacyModelId: model }),
    observation({ config: null, legacyModelId: `${model}[unknown]` }),
    observation({ state: "unavailable" }),
  ])(
    "rejects malformed/truncated projection without guessing or raw diagnostics",
    (value) => {
      const result = initialSelectionEvidence(session(value));
      expect(result.state).toBe("rejected");
      expect(result.modelSha256).toBeNull();
      expect(result.reasoningEffort).toBeNull();
      expect(JSON.stringify(result)).not.toContain(model);
    },
  );
  it("leaves old receipts and other adapters unavailable, without metadata promotion", () => {
    expect(initialSelectionEvidence(session()).state).toBe("unavailable");
    expect(
      initialSelectionEvidence({
        ...session(observation()),
        agentType: "claude",
      }).state,
    ).toBe("unavailable");
    expect(
      initialSelectionEvidence({
        ...session(),
        metadata: { initialModelSelection: observation() },
      }).state,
    ).toBe("unavailable");
  });
  it("never invokes accessors or retains unrelated canary/catalog fields", () => {
    let called = 0;
    const value = observation();
    Object.defineProperty(value, "config", {
      get: () => {
        called++;
        throw new Error("PRIVATE_CANARY");
      },
    });
    expect(initialSelectionEvidence(session(value)).state).toBe("rejected");
    expect(called).toBe(0);
    const result = initialSelectionEvidence(
      session(
        observation({
          description: "PRIVATE_CANARY",
          availableModels: [{ description: "PRIVATE_CANARY" }],
        }),
      ),
    );
    expect(JSON.stringify(result)).not.toContain("PRIVATE_CANARY");
  });
  it("does not promote JSON own __proto__ or inherited selector fields to evidence", () => {
    const ownProto = (value: unknown) =>
      JSON.parse(JSON.stringify({ ["__proto__"]: value }));
    const injected = observation({
      config: { model: "PRIVATE_PROTO_CANARY", reasoningEffort: "medium" },
    });
    expect(initialSelectionEvidence(session(ownProto(injected))).state).toBe(
      "rejected",
    );
    const config = ownProto({
      model: "PRIVATE_PROTO_CANARY",
      reasoningEffort: "medium",
    });
    const result = initialSelectionEvidence(session(observation({ config })));
    expect(result.state).toBe("rejected");
    expect(result.modelSha256).toBeNull();
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PROTO_CANARY");
    const inherited = Object.create(injected);
    expect(initialSelectionEvidence(session(inherited)).state).toBe("rejected");
    const outer = ownProto({ ...session(injected) }) as AcpSession;
    expect(initialSelectionEvidence(outer).state).toBe("unavailable");
  });
});
