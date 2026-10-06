// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  copyContextText,
  observeContextMenuCopy,
} from "./context-menu-clipboard";

afterEach(() => vi.unstubAllGlobals());

describe("context menu clipboard feedback", () => {
  it("copies the explicit target without exposing its content in notices", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const push = vi.fn().mockReturnValue("toast");
    const dispose = observeContextMenuCopy(push);
    try {
      await copyContextText("the explicitly selected metadata");
      expect(writeText).toHaveBeenCalledWith(
        "the explicitly selected metadata",
      );
      expect(push).toHaveBeenCalledWith({
        tone: "success",
        message: "Copied to clipboard.",
      });
    } finally {
      dispose();
    }
  });

  it("handles permission failure without exposing raw errors or rejecting", async () => {
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("private detail")),
      },
    });
    const push = vi.fn().mockReturnValue("toast");
    const dispose = observeContextMenuCopy(push);
    try {
      await expect(copyContextText("metadata")).resolves.toBeUndefined();
      expect(push).toHaveBeenCalledWith({
        tone: "error",
        message: "Could not copy. Try the standard Copy command.",
      });
    } finally {
      dispose();
    }
  });

  it("ignores arbitrary notices and removes the listener when its host unmounts", async () => {
    const push = vi.fn().mockReturnValue("toast");
    const dispose = observeContextMenuCopy(push);
    window.dispatchEvent(
      new CustomEvent("doolittle:context-menu-copy", { detail: "other" }),
    );
    expect(push).not.toHaveBeenCalled();
    dispose();
    vi.stubGlobal("navigator", {});
    await copyContextText("metadata");
    expect(push).not.toHaveBeenCalled();
  });
});
