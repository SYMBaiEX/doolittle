import { describe, expect, it } from "bun:test";
import { resolvePostProviderFallback } from "./fallback";

type FallbackInput = Parameters<typeof resolvePostProviderFallback>[0];

function makeInput(aborted: boolean, onLoad: () => void): FallbackInput {
  const controller = new AbortController();
  if (aborted) {
    controller.abort();
  }
  return {
    context: {
      services: {
        runController: { getActive: () => undefined, finishTurn: () => {} },
      },
    },
    effectiveInput: { message: "scaffold the project" },
    turn: { sessionId: "s1", localInteractive: true },
    options: { abortSignal: controller.signal },
    loadDirectLocalIntent: async () => {
      onLoad();
      return {
        directLocalIntent: undefined,
        shouldUseDirectLocalFallback: () => false,
        isHighConfidenceDirectLocalIntent: () => false,
        requiresModelSynthesisForLocalIntent: () => false,
        executeDirectLocalIntent: async () => "",
      };
    },
    approveDirectLocalIntent: async () => undefined,
    actionResults: [],
    response: "",
    runFailureMessage: "aborted by user",
  } as unknown as FallbackInput;
}

describe("resolvePostProviderFallback abort handling", () => {
  it("never runs the direct-local fallback when the turn was aborted", async () => {
    let loaded = false;
    const result = await resolvePostProviderFallback(
      makeInput(true, () => {
        loaded = true;
      }),
    );
    // The fallback loader must not even be consulted — otherwise cancelled work
    // could re-execute.
    expect(loaded).toBe(false);
    expect(result).toMatchObject({ kind: "continue", usedFallback: false });
  });

  it("consults the fallback loader on a non-aborted failed turn", async () => {
    let loaded = false;
    const result = await resolvePostProviderFallback(
      makeInput(false, () => {
        loaded = true;
      }),
    );
    expect(loaded).toBe(true);
    expect(result).toMatchObject({ kind: "continue" });
  });
});
