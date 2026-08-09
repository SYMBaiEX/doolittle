import { ModelType } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { listRuntimeModelCapabilities } from "./runtime-model-capabilities";

describe("runtime model capability truth", () => {
  it("derives states from resolved Eliza handlers, not provider labels", () => {
    const getModel = vi.fn((modelType: string) =>
      modelType === ModelType.RESEARCH || modelType === ModelType.IMAGE
        ? () => Promise.resolve({})
        : undefined,
    );

    const capabilities = listRuntimeModelCapabilities({ getModel } as never);

    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "research",
          modelType: ModelType.RESEARCH,
          handlerRegistered: true,
          state: "available",
        }),
        expect.objectContaining({
          id: "image",
          handlerRegistered: true,
          state: "available",
        }),
        expect.objectContaining({
          id: "speech",
          handlerRegistered: false,
          state: "unavailable",
        }),
      ]),
    );
    expect(getModel).toHaveBeenCalledWith(ModelType.RESEARCH);
  });

  it("reports unavailable when runtime handler lookup fails", () => {
    const capabilities = listRuntimeModelCapabilities({
      getModel: () => {
        throw new Error("registry unavailable");
      },
    } as never);

    expect(
      capabilities.every((capability) => !capability.handlerRegistered),
    ).toBe(true);
  });
});
