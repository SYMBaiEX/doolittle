import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { describe, expect, it, vi } from "vitest";
import {
  installRenderReadiness,
  renderCaptureStep,
} from "./browser-render-readiness";

function setup() {
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
  });
  const invalidated = vi.fn();
  const gate = installRenderReadiness({
    window: window as unknown as BrowserWindow,
    acceptsCommit: (url) => url === "owned-target",
    invalidated,
  });
  const navigate = (url = "owned-target") => {
    contents.emit("did-start-navigation", { isMainFrame: true });
    contents.emit("did-navigate", {}, url);
  };
  const paint = (width = 1280, height = 720, empty = false) =>
    contents.emit(
      "paint",
      {},
      {},
      { isEmpty: () => empty, getSize: () => ({ width, height }) },
    );
  return { window, contents, gate, navigate, paint, invalidated };
}

describe("Linux OSR navigation-epoch first frame latch", () => {
  it("latches early committed paint without missing it before a waiter exists", async () => {
    const { gate, navigate, paint, contents, window } = setup();
    navigate();
    paint();
    const epoch = await gate.wait(new AbortController().signal);
    expect(() => gate.assertCurrent(epoch)).not.toThrow();
    gate.dispose();
    expect(contents.eventNames()).toEqual([]);
    expect(window.eventNames()).toEqual([]);
  });
  it("ignores precommit/about:blank paint and ready-to-show", async () => {
    const { gate, navigate, paint, window } = setup();
    paint();
    navigate("about:blank");
    paint();
    window.emit("ready-to-show");
    navigate();
    const controller = new AbortController();
    const result = gate.wait(controller.signal);
    const settled = vi.fn();
    void result.then(settled, () => {});
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    paint();
    const awaitedEpoch = await result;
    expect(() => gate.assertCurrent(awaitedEpoch)).not.toThrow();
    gate.dispose();
  });
  it.each([
    [0, 720],
    [1280, -1],
    [NaN, 720],
    [1280, Infinity],
    [1.5, 720],
    [16_385, 1],
  ])("refuses invalid/empty metadata (%s,%s)", async (width, height) => {
    const { gate, navigate, paint } = setup();
    navigate();
    paint(width, height);
    paint(1280, 720, true);
    const controller = new AbortController();
    const result = gate.wait(controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow("Native first frame is unavailable.");
    gate.dispose();
  });
  it("uses only metadata and permits bounded dimensions without asserting pixel units", async () => {
    const { gate, navigate, contents } = setup();
    navigate();
    const image = {
      isEmpty: () => false,
      getSize: () => ({ width: 390, height: 844 }),
      toPNG: vi.fn(),
      toBitmap: vi.fn(),
    };
    contents.emit("paint", {}, {}, image);
    await expect(gate.wait(new AbortController().signal)).resolves.toBeTypeOf(
      "number",
    );
    expect(image.toPNG).not.toHaveBeenCalled();
    expect(image.toBitmap).not.toHaveBeenCalled();
    gate.dispose();
  });
  it.each(["start", "commit", "in-page"])(
    "invalidates already latched readiness on %s",
    async (kind) => {
      const { gate, navigate, paint, contents } = setup();
      navigate();
      paint();
      const epoch = await gate.wait(new AbortController().signal);
      if (kind === "start")
        contents.emit("did-start-navigation", { isMainFrame: true });
      else if (kind === "commit")
        contents.emit("did-navigate", {}, "owned-target");
      else contents.emit("did-navigate-in-page", {}, "owned-target", true);
      expect(() => gate.assertCurrent(epoch)).toThrow(
        "Native first frame is unavailable.",
      );
      const controller = new AbortController();
      const waiting = gate.wait(controller.signal);
      controller.abort();
      await expect(waiting).rejects.toThrow();
      gate.dispose();
    },
  );
  it("does not invalidate on unrelated subframe navigation", async () => {
    const { gate, navigate, paint, contents } = setup();
    navigate();
    paint();
    const epoch = await gate.wait(new AbortController().signal);
    contents.emit("did-start-navigation", { isMainFrame: false });
    contents.emit("did-navigate-in-page", {}, "unrelated", false);
    expect(() => gate.assertCurrent(epoch)).not.toThrow();
    gate.dispose();
  });
  it("rejects an old epoch waiter on pending replacement and requires a new commit and paint", async () => {
    const { gate, navigate, paint, contents } = setup();
    navigate();
    const old = gate.wait(new AbortController().signal);
    contents.emit("did-start-navigation", { isMainFrame: true });
    await expect(old).rejects.toThrow("Native first frame is unavailable.");
    paint();
    contents.emit("did-navigate", {}, "owned-target");
    const fresh = gate.wait(new AbortController().signal);
    paint();
    const epoch = await fresh;
    expect(() => gate.assertCurrent(epoch)).not.toThrow();
    gate.dispose();
  });
  it("cleans an aborted waiter and never lets another window's paint satisfy it", async () => {
    const first = setup();
    const second = setup();
    first.navigate();
    second.navigate();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const result = first.gate.wait(controller.signal);
    second.paint();
    controller.abort();
    await expect(result).rejects.toThrow();
    expect(remove).toHaveBeenCalledExactlyOnceWith(
      "abort",
      expect.any(Function),
    );
    first.paint();
    await expect(
      first.gate.wait(new AbortController().signal),
    ).resolves.toBeTypeOf("number");
    first.gate.dispose();
    second.gate.dispose();
  });
  it.each(["close", "destroyed", "crash", "dispose"])(
    "rejects waiters and cleans only its listeners on %s",
    async (end) => {
      const { gate, navigate, window, contents } = setup();
      const foreign = vi.fn();
      contents.on("paint", foreign);
      navigate();
      const result = gate.wait(new AbortController().signal);
      if (end === "close") window.emit("closed");
      else if (end === "destroyed") contents.emit("destroyed");
      else if (end === "crash") contents.emit("render-process-gone");
      else gate.dispose();
      await expect(result).rejects.toThrow();
      expect(contents.listeners("paint")).toEqual([foreign]);
      expect(window.eventNames()).toEqual([]);
      expect(contents.eventNames()).toEqual(["paint"]);
      contents.emit("paint");
      expect(foreign).toHaveBeenCalledOnce();
    },
  );
  it("fails closed on native metadata exceptions without exporting them", async () => {
    const { gate, navigate, contents } = setup();
    navigate();
    const image = Object.defineProperty({}, "isEmpty", {
      get() {
        throw new Error("CANARY_PRIVATE");
      },
    });
    expect(() => contents.emit("paint", {}, {}, image)).not.toThrow();
    const controller = new AbortController();
    const result = gate.wait(controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow("Native first frame is unavailable.");
    gate.dispose();
  });
  it("cleans partially registered listeners on setup failure", () => {
    const contents = Object.assign(new EventEmitter(), {
      isDestroyed: () => false,
    });
    const window = Object.assign(new EventEmitter(), {
      webContents: contents,
      isDestroyed: () => false,
    });
    vi.spyOn(window, "on").mockImplementation(() => {
      throw new Error("CANARY_PRIVATE");
    });
    expect(() =>
      installRenderReadiness({
        window: window as unknown as BrowserWindow,
        acceptsCommit: () => true,
        invalidated: vi.fn(),
      }),
    ).toThrow("Native first frame is unavailable.");
    expect(contents.eventNames()).toEqual([]);
  });
});

describe("owned Linux capture abort step", () => {
  it("never starts a step after abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const action = vi.fn(async () => 1);
    await expect(
      renderCaptureStep(controller.signal, action),
    ).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects in-flight work and prevents a subsequent step even if native work later fulfills", async () => {
    const controller = new AbortController();
    let release = (_value: number) => {};
    const action = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          release = resolve;
        }),
    );
    const result = renderCaptureStep(controller.signal, action);
    controller.abort();
    await expect(result).rejects.toThrow();
    release(1);
    const next = vi.fn(async () => 2);
    await expect(renderCaptureStep(controller.signal, next)).rejects.toThrow();
    expect(action).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
  it("preserves successful result identity and removes its abort listener", async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const value = {};
    expect(await renderCaptureStep(controller.signal, async () => value)).toBe(
      value,
    );
    expect(remove).toHaveBeenCalledOnce();
  });
  it("preserves rejection identity and cleans listeners on synchronous throws", async () => {
    const controller = new AbortController();
    const error = new Error("synthetic owned failure");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    await expect(
      renderCaptureStep(controller.signal, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await expect(
      renderCaptureStep(controller.signal, () => {
        throw error;
      }),
    ).rejects.toBe(error);
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
