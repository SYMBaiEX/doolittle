// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: class MockWebglAddon {
    onContextLoss() {
      return { dispose() {} };
    }
    dispose() {}
  },
}));

import { attachTerminalAcceleration } from "./InteractiveTerminal";

describe("attachTerminalAcceleration", () => {
  it("falls back cleanly when WebGL is unavailable", async () => {
    const originalWebgl = window.WebGLRenderingContext;
    const originalWebgl2 = window.WebGL2RenderingContext;
    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "WebGL2RenderingContext", {
      configurable: true,
      value: undefined,
    });

    const terminal = { loadAddon: vi.fn() };
    const result = attachTerminalAcceleration(terminal);

    await expect(result.ready).resolves.toBe(false);
    expect(terminal.loadAddon).not.toHaveBeenCalled();
    result.dispose();

    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: originalWebgl,
    });
    Object.defineProperty(window, "WebGL2RenderingContext", {
      configurable: true,
      value: originalWebgl2,
    });
  });

  it("falls back cleanly when addon loading throws", async () => {
    Object.defineProperty(window, "WebGLRenderingContext", {
      configurable: true,
      value: class MockWebGLRenderingContext {},
    });
    const terminal = {
      loadAddon: vi.fn(() => {
        throw new Error("renderer unavailable");
      }),
    };

    const result = attachTerminalAcceleration(terminal);

    await expect(result.ready).resolves.toBe(false);
    expect(terminal.loadAddon).toHaveBeenCalledTimes(1);
    expect(() => result.dispose()).not.toThrow();
  });
});
