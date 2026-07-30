import { describe, expect, it } from "vitest";
import { createRuntimeBoundDocumentsState } from "./state-runtime";

describe("createRuntimeBoundDocumentsState", () => {
  it("uses the provided runtime for the initial documents instance", () => {
    const state = createRuntimeBoundDocumentsState(
      { id: "boot" },
      (runtime: { id: string }) => ({ tag: runtime.id }),
    );

    expect(state.documents.get()).toEqual({ tag: "boot" });
  });

  it("fails closed before binding and then uses the real runtime", () => {
    const calls: string[] = [];
    const state = createRuntimeBoundDocumentsState<
      { id?: string },
      { tag: string }
    >(undefined, (runtime) => {
      const tag = runtime.id ?? "fallback";
      calls.push(tag);
      return { tag };
    });

    expect(() => state.documents.get()).toThrow(
      "DocumentsService requires the initialized Eliza runtime.",
    );

    state.setBoundRuntime({ id: "runtime-1" });

    expect(state.documents.get()).toEqual({ tag: "runtime-1" });
    expect(calls).toEqual(["runtime-1"]);
  });
});
