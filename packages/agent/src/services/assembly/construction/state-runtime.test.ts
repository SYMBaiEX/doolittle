import { describe, expect, it } from "bun:test";
import { createRuntimeBoundDocumentsState } from "./state-runtime";

describe("createRuntimeBoundDocumentsState", () => {
  it("uses the provided runtime for the initial documents instance", () => {
    const state = createRuntimeBoundDocumentsState(
      { id: "boot" },
      (runtime: { id: string }) => ({ tag: runtime.id }),
    );

    expect(state.documents.get()).toEqual({ tag: "boot" });
  });

  it("falls back before binding and then accepts a later runtime", () => {
    const calls: string[] = [];
    const state = createRuntimeBoundDocumentsState<
      { id?: string },
      { tag: string }
    >(undefined, (runtime) => {
      const tag = runtime.id ?? "fallback";
      calls.push(tag);
      return { tag };
    });

    expect(state.documents.get()).toEqual({ tag: "fallback" });

    state.setBoundRuntime({ id: "runtime-1" });
    state.documents.set(state.createDocumentsService({ id: "runtime-1" }));

    expect(state.documents.get()).toEqual({ tag: "runtime-1" });
    expect(calls).toEqual(["fallback", "runtime-1"]);
  });
});
