import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWindowOptions } from "../src/main/browser-render-window";
import {
  actualFixtureCaptureBackend,
  fixtureWindowOptions,
  installFixtureRuntimeObservation,
  installNativeFixtureShutdown,
  nativeFixtureEnvironment,
  parseNativeFixtureOutcome,
  parseNativeFixtureRequest,
  pinFixtureDirectory,
  removePinnedFixtureDirectory,
  resolveFixtureCaptureBackend,
  resolveFixtureCaptureScale,
  startNativeRendererFixture,
} from "./native-renderer-fixture";

const capture = {
  png: "iVBORw0KGgo=",
  width: 2560,
  height: 1440,
  viewport: { width: 1280, height: 720 },
  factsViewport: { width: 1280, height: 720, deviceScaleFactor: 2 },
  bitmapBytes: 2560 * 1440 * 4,
  sentinelBGRA: [20, 40, 255, 255],
  hidden: true,
  privatePartition: true,
  blockedRequests: 0,
  captureMode: "rendered-page",
  images: [{ alt: "Owned synthetic raster", loaded: true }],
  diagnostic: null,
};
class SyntheticChild extends EventEmitter {
  pid = 424242;
  connected = true;
  send = vi.fn(
    (message: { type: string }, callback?: (error: Error | null) => void) => {
      callback?.(null);
      if (message.type === "capture")
        this.emit("message", { type: "captured", capture });
      if (message.type === "dispose") {
        this.emit("message", { type: "disposed" });
        this.close();
      }
      return true;
    },
  );
  close() {
    this.connected = false;
    this.emit("disconnect");
    this.emit("close", 0, null);
  }
}
function start(child: SyntheticChild, absent = () => true, signal = vi.fn()) {
  return startNativeRendererFixture({
    entry: "owned-fixture.cjs",
    ownedDir: "owned-fixture",
    spawnChild: () => child as unknown as ChildProcess,
    probeGroupAbsent: absent,
    signalGroup: signal,
    timeoutMs: 50,
    killGraceMs: 20,
  });
}
afterEach(() => vi.useRealTimers());

function syntheticRuntime(offscreen = true, now = () => 0) {
  const contents = Object.assign(new EventEmitter(), {
    isOffscreen: vi.fn(() => offscreen),
    isPainting: vi.fn(() => true),
    getFrameRate: vi.fn(() => 60),
    isDestroyed: vi.fn(() => false),
    isLoading: vi.fn(() => false),
    isLoadingMainFrame: vi.fn(() => false),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: vi.fn(() => false),
  });
  const observer = installFixtureRuntimeObservation({
    window: window as unknown as import("electron").BrowserWindow,
    isOwnedTarget: (url) => url === "owned-synthetic-target",
    now,
  });
  return { contents, window, observer };
}
const paintImage = (width = 2560, height = 1440) => ({
  isEmpty: vi.fn(() => false),
  getSize: vi.fn(() => ({ width, height })),
  toPNG: vi.fn(() => {
    throw new Error("CANARY_PRIVATE");
  }),
  toBitmap: vi.fn(() => {
    throw new Error("CANARY_PRIVATE");
  }),
});
function exampleRuntimeReceipts() {
  const { observer } = syntheticRuntime();
  observer.beforeCapture();
  observer.settle();
  return observer.receipts;
}

describe("passive capture runtime receipts", () => {
  it("marks unavailable native reads at refusal without inventing a settlement or exporting errors", () => {
    const { contents, window, observer } = syntheticRuntime();
    contents.isOffscreen.mockImplementation(() => {
      throw new Error("CANARY_PRIVATE");
    });
    window.emit("closed");
    observer.readinessRefused();
    expect(observer.receipts.atReadinessRefusal).toMatchObject({
      isOffscreen: null,
      unavailable: true,
    });
    expect(observer.receipts.preCapture).toBeNull();
    expect(observer.receipts.settled).toBeNull();
    expect(JSON.stringify(observer.receipts)).not.toContain("CANARY_PRIVATE");
    expect(contents.listenerCount("paint")).toBe(0);
  });
  it("keeps three snapshots and tags chronology, not about:blank or frame content", () => {
    let clock = 100;
    const { contents, window, observer } = syntheticRuntime(true, () => clock);
    const image = paintImage();
    expect(observer.receipts.constructed).toMatchObject({
      isOffscreen: true,
      isPainting: true,
      frameRate: 60,
      ownedNavigationCommitted: false,
      paintCount: 0,
    });
    clock = 110;
    contents.emit("did-navigate", {}, "about:blank");
    contents.emit("paint", {}, {}, image);
    window.emit("ready-to-show");
    clock = 120;
    contents.emit("did-navigate", {}, "owned-synthetic-target");
    contents.emit("paint", {}, {}, image);
    observer.beforeCapture();
    expect(observer.receipts.preCapture).toMatchObject({
      ownedNavigationCommitted: true,
      paintCount: 2,
      paintAfterOwnedCommitCount: 1,
      readyToShowCount: 1,
      readyAfterOwnedCommitCount: 0,
      firstPaintMs: 10,
      lastPaintMs: 20,
      firstPaintAfterOwnedCommitMs: 20,
      lastNonemptyPaintAfterOwnedCommitSize: { width: 2560, height: 1440 },
    });
    clock = 125;
    contents.emit("paint", {}, {}, image);
    observer.settle();
    expect(observer.receipts.settled).toMatchObject({
      paintCount: 3,
      paintAfterOwnedCommitCount: 2,
      lastPaintMs: 25,
      unavailable: false,
    });
    expect(observer.receipts.preCapture?.paintCount).toBe(2);
    expect(observer.receipts.constructed.paintCount).toBe(0);
    expect(image.toPNG).not.toHaveBeenCalled();
    expect(image.toBitmap).not.toHaveBeenCalled();
    expect(JSON.stringify(observer.receipts)).not.toContain(
      "owned-synthetic-target",
    );
    expect(JSON.stringify(observer.receipts)).not.toContain("about:blank");
    expect(contents.listenerCount("paint")).toBe(0);
    expect(contents.listenerCount("did-navigate")).toBe(0);
    expect(contents.listenerCount("destroyed")).toBe(0);
    expect(window.listenerCount("ready-to-show")).toBe(0);
    expect(window.listenerCount("closed")).toBe(0);
    contents.emit("paint", {}, {}, image);
    observer.settle();
    expect(observer.receipts.settled?.paintCount).toBe(3);
  });
  it("does not query painting/frame rate on an onscreen window", () => {
    const { contents, observer } = syntheticRuntime(false);
    observer.beforeCapture();
    observer.settle();
    expect(contents.isPainting).not.toHaveBeenCalled();
    expect(contents.getFrameRate).not.toHaveBeenCalled();
    expect(observer.receipts.settled).toMatchObject({
      isOffscreen: false,
      isPainting: null,
      frameRate: null,
      unavailable: false,
    });
  });
  it.each(["close", "contents-destroyed", "dispose"])(
    "removes every observer on %s without fabricating native settlement",
    (end) => {
      const { contents, window, observer } = syntheticRuntime();
      if (end === "close") window.emit("closed");
      else if (end === "contents-destroyed") contents.emit("destroyed");
      else observer.dispose();
      expect(contents.eventNames()).toEqual([]);
      expect(window.eventNames()).toEqual([]);
      expect(observer.receipts.settled).toBeNull();
    },
  );
  it("bounds metadata and never exports accessor/native error canaries", () => {
    let clock = 0;
    const { contents, observer } = syntheticRuntime(true, () => clock);
    const image = paintImage();
    for (let count = 0; count < 1002; count++)
      contents.emit("paint", {}, {}, image);
    contents.isPainting.mockImplementation(() => {
      throw new Error("CANARY_PRIVATE");
    });
    const badImage = Object.defineProperty({}, "isEmpty", {
      get() {
        throw new Error("CANARY_PRIVATE");
      },
    });
    expect(() => contents.emit("paint", {}, {}, badImage)).not.toThrow();
    clock = Infinity;
    contents.emit("paint", {}, {}, paintImage(1e9, -1));
    observer.beforeCapture();
    observer.settle();
    expect(observer.receipts.settled).toMatchObject({
      paintCount: 1000,
      countsCapped: true,
      isPainting: null,
      unavailable: true,
      lastPaintMs: null,
    });
    expect(JSON.stringify(observer.receipts)).not.toContain("CANARY_PRIVATE");
    expect(image.toPNG).not.toHaveBeenCalled();
    expect(image.toBitmap).not.toHaveBeenCalled();
  });
});

describe("fixture-only rendering backend", () => {
  const base = Object.freeze({
    width: 1280,
    height: 720,
    useContentSize: true,
    show: false,
    skipTaskbar: true,
    webPreferences: Object.freeze({
      partition: "doolittle-capture-synthetic",
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
      devTools: false,
    }),
  });
  it("defaults to product policy and preserves incoming options by identity", () => {
    expect(resolveFixtureCaptureBackend(undefined)).toBe("product-default");
    expect(resolveFixtureCaptureBackend("product-default")).toBe(
      "product-default",
    );
    expect(fixtureWindowOptions(base, "product-default")).toBe(base);
    expect(fixtureWindowOptions(base, "onscreen")).toBe(base);
  });
  it.each([1, 1.25, 1.5, 2] as const)(
    "exercises actual Linux product options at scale %s without substitution",
    (scale) => {
      const product = captureWindowOptions(base, "linux", () => scale);
      expect(fixtureWindowOptions(product, "product-default", scale)).toBe(
        product,
      );
      expect(actualFixtureCaptureBackend(product)).toBe("offscreen");
      const onscreen = fixtureWindowOptions(product, "onscreen", scale);
      expect(onscreen).toEqual(base);
      expect(actualFixtureCaptureBackend(onscreen)).toBe("onscreen");
      expect(
        actualFixtureCaptureBackend(
          fixtureWindowOptions(base, "offscreen", scale),
        ),
      ).toBe("offscreen");
      expect(
        fixtureWindowOptions(base, "offscreen", scale).webPreferences
          ?.offscreen,
      ).toEqual({
        useSharedTexture: false,
        deviceScaleFactor: scale,
      });
    },
  );
  it.each(["darwin", "win32"] as const)(
    "keeps actual %s product backend onscreen",
    (platform) => {
      const product = captureWindowOptions(base, platform, () => 2);
      expect(fixtureWindowOptions(product, "product-default")).toBe(base);
      expect(actualFixtureCaptureBackend(product)).toBe("onscreen");
    },
  );
  it("uses a closed scale parser with a default of 2", () => {
    expect(resolveFixtureCaptureScale(undefined)).toBe(2);
    for (const scale of [1, 1.25, 1.5, 2] as const)
      expect(resolveFixtureCaptureScale(String(scale))).toBe(scale);
  });
  it.each([
    "",
    "0",
    "-1",
    "3",
    "2.0",
    "NaN",
    "Infinity",
    "CANARY_PRIVATE",
    2,
    null,
    {},
    true,
  ])("rejects scale values outside the closed fixture enum (%j)", (value) =>
    expect(() => resolveFixtureCaptureScale(value)).toThrow(
      "Unknown renderer fixture scale.",
    ),
  );
  it("refuses unsupported explicit OSR scale before a child or constructor can start", () => {
    expect(() => fixtureWindowOptions(base, "offscreen", 3 as 2)).toThrow(
      "Unknown renderer fixture scale.",
    );
    const spawnChild = vi.fn();
    expect(() =>
      startNativeRendererFixture({
        entry: "unused",
        ownedDir: "unused",
        captureScale: 3 as 2,
        spawnChild,
      }),
    ).toThrow("Native renderer fixture protocol failed.");
    expect(spawnChild).not.toHaveBeenCalled();
  });
  it("only adds GPU-composed CPU-bitmap OSR at the same requested DPR2", () => {
    expect(resolveFixtureCaptureBackend("offscreen")).toBe("offscreen");
    expect(fixtureWindowOptions(base, "offscreen")).toEqual({
      ...base,
      webPreferences: {
        ...base.webPreferences,
        offscreen: { useSharedTexture: false, deviceScaleFactor: 2 },
      },
    });
    expect(Object.hasOwn(base.webPreferences, "offscreen")).toBe(false);
  });
  it.each(["", "OFFSCREEN", "software", "CANARY_PRIVATE", null, {}, true])(
    "rejects unknown backend values with fixed text (%j)",
    (value) => {
      expect(() => resolveFixtureCaptureBackend(value)).toThrow(
        "Unknown renderer fixture backend.",
      );
    },
  );
  const window = {
    backend: "onscreen",
    loaded: true,
    closed: true,
    unresponsive: false,
    mainFrameLoadErrorCode: null,
    renderProcessGone: null,
    constructor: { width: 1280, height: 720 },
    forcedScaleFactor: 2,
    constructed: null,
    atCapture: null,
    runtime: exampleRuntimeReceipts(),
    factsViewport: null,
    png: null,
    phase: "capture-page",
    failedPhase: "capture-page",
    nativeCapture: {
      settlement: "promise-reject",
      durationMs: 20,
      failure: "viz-error",
    },
    calls: {
      executeJavaScript: 2,
      waitForRender: 1,
      renderedFacts: 1,
      capturePage: 1,
      pngEncode: 0,
    },
    observationUnavailable: false,
  };
  const failure = {
    phase: "first-snapshot",
    refusalPhase: null,
    status: 502,
    error: "Rendered evidence could not be captured.",
    truncated: false,
    elapsedMs: 20,
    window,
  };
  it("projects readiness refusal separately without inventing native capture settlement", () => {
    const { observer, contents, window: receiver } = syntheticRuntime();
    contents.emit("did-navigate", {}, "owned-synthetic-target");
    receiver.emit("closed");
    observer.readinessRefused();
    expect(observer.receipts.preCapture).toBeNull();
    expect(observer.receipts.settled).toBeNull();
    expect(observer.receipts.atReadinessRefusal).toMatchObject({
      paintCount: 0,
      ownedNavigationCommitted: true,
    });
    const refused = {
      ...failure,
      refusalPhase: "native-readiness",
      window: {
        ...window,
        runtime: observer.receipts,
        phase: "wait-for-render",
        failedPhase: null,
        nativeCapture: null,
        calls: {
          executeJavaScript: 1,
          waitForRender: 1,
          renderedFacts: 0,
          capturePage: 0,
          pngEncode: 0,
        },
      },
    };
    expect(
      parseNativeFixtureOutcome({ type: "capture-failed", failure: refused }),
    ).toEqual({ capture: null, failure: refused });
    expect(contents.listenerCount("paint")).toBe(0);
    for (const refusalPhase of ["CANARY_PRIVATE", {}, "capture-page"])
      expect(
        parseNativeFixtureOutcome({
          type: "capture-failed",
          failure: { ...refused, refusalPhase },
        }),
      ).toBeNull();
    expect(
      parseNativeFixtureOutcome({
        type: "capture-failed",
        failure: { ...refused, phase: "open" },
      }),
    ).toBeNull();
    expect(
      parseNativeFixtureOutcome({
        type: "capture-failed",
        failure: { ...refused, status: 400 },
      }),
    ).toBeNull();
    for (const delta of [
      { nativeCapture: window.nativeCapture },
      { factsViewport: capture.factsViewport },
      {
        runtime: {
          ...observer.receipts,
          settled: observer.receipts.constructed,
        },
      },
      { calls: { ...refused.window.calls, capturePage: 1 } },
      { png: { bytes: 1, ihdr: null } },
    ])
      expect(
        parseNativeFixtureOutcome({
          type: "capture-failed",
          failure: { ...refused, window: { ...refused.window, ...delta } },
        }),
      ).toBeNull();
  });
  it.each(["onscreen", "offscreen"])(
    "retains only the closed backend enum across success/failure IPC (%s)",
    (backend) => {
      const diagnostic = { ...window, backend };
      const result = { ...capture, diagnostic };
      const failed = { ...failure, window: diagnostic };
      expect(
        parseNativeFixtureOutcome({ type: "captured", capture: result }),
      ).toEqual({
        capture: result,
        failure: null,
      });
      expect(
        parseNativeFixtureOutcome({ type: "capture-failed", failure: failed }),
      ).toEqual({
        capture: null,
        failure: failed,
      });
    },
  );
  it("rejects missing, unknown and extra backend diagnostic fields", () => {
    const { backend: _backend, ...missing } = window;
    for (const diagnostic of [
      missing,
      { ...window, backend: "CANARY_PRIVATE" },
      { ...window, backend: "offscreen", software: true },
    ]) {
      expect(
        parseNativeFixtureOutcome({
          type: "captured",
          capture: { ...capture, diagnostic },
        }),
      ).toBeNull();
      expect(
        parseNativeFixtureOutcome({
          type: "capture-failed",
          failure: { ...failure, window: diagnostic },
        }),
      ).toBeNull();
    }
  });
  it("rejects unbounded, missing and private runtime receipts across both IPC outcomes", () => {
    const sample = window.runtime.constructed;
    const { runtime: _runtime, ...missing } = window;
    const invalid = [
      missing,
      { ...window, runtime: { ...window.runtime, raw: "CANARY_PRIVATE" } },
      ...[
        { isOffscreen: "CANARY_PRIVATE" },
        { paintCount: 1001 },
        { paintCount: -1 },
        { readyToShowCount: 0.5 },
        { lastPaintMs: Infinity },
        { firstReadyMs: -1 },
        { lastReadyMs: 60_001 },
        { frameRate: 241 },
        { isPainting: null },
        { isOffscreen: false },
        { paintAfterOwnedCommitCount: 1 },
        { lastNonemptyPaintSize: { width: 16_385, height: 1 } },
        {
          lastNonemptyPaintSize: { width: 1, height: 1, raw: "CANARY_PRIVATE" },
        },
      ].map((delta) => ({
        ...window,
        runtime: { ...window.runtime, constructed: { ...sample, ...delta } },
      })),
    ];
    for (const diagnostic of invalid) {
      expect(
        parseNativeFixtureOutcome({
          type: "captured",
          capture: { ...capture, diagnostic },
        }),
      ).toBeNull();
      expect(
        parseNativeFixtureOutcome({
          type: "capture-failed",
          failure: { ...failure, window: diagnostic },
        }),
      ).toBeNull();
    }
  });
  it("retains explicit unavailable states without claiming successful observations", () => {
    const { contents, observer } = syntheticRuntime();
    contents.isOffscreen.mockImplementation(() => {
      throw new Error("CANARY_PRIVATE");
    });
    observer.beforeCapture();
    observer.settle();
    const diagnostic = { ...window, runtime: observer.receipts };
    const result = parseNativeFixtureOutcome({
      type: "captured",
      capture: { ...capture, diagnostic },
    });
    expect(result?.capture?.diagnostic?.runtime?.settled).toMatchObject({
      isOffscreen: null,
      isPainting: null,
      frameRate: null,
      unavailable: true,
    });
    expect(JSON.stringify(result)).not.toContain("CANARY_PRIVATE");
    expect(
      parseNativeFixtureOutcome({
        type: "captured",
        capture: {
          ...capture,
          diagnostic: {
            ...window,
            runtime: null,
            observationUnavailable: true,
          },
        },
      }),
    ).not.toBeNull();
    expect(
      parseNativeFixtureOutcome({
        type: "captured",
        capture: { ...capture, diagnostic: { ...window, runtime: null } },
      }),
    ).toBeNull();
  });
});

describe("pinned test directory cleanup", () => {
  it.each(["missing", "symlink", "replacement"])(
    "retains both original and foreign sentinels after %s substitution",
    (substitution) => {
      const root = mkdtempSync(join(tmpdir(), "doolittle-fixture-identity-"));
      const owned = join(root, "owned");
      const held = join(root, "held");
      const foreign = join(root, "foreign");
      try {
        mkdirSync(owned);
        mkdirSync(foreign);
        writeFileSync(join(owned, "original"), "original");
        writeFileSync(join(foreign, "sentinel"), "foreign");
        const pinned = pinFixtureDirectory(owned);
        renameSync(owned, held);
        if (substitution === "symlink") symlinkSync(foreign, owned, "dir");
        if (substitution === "replacement") {
          mkdirSync(owned);
          writeFileSync(join(owned, "sentinel"), "replacement");
        }
        expect(() => removePinnedFixtureDirectory(pinned)).toThrow(
          "Fixture directory identity changed; private state retained.",
        );
        expect(readFileSync(join(held, "original"), "utf8")).toBe("original");
        expect(readFileSync(join(foreign, "sentinel"), "utf8")).toBe("foreign");
        if (substitution === "replacement")
          expect(readFileSync(join(owned, "sentinel"), "utf8")).toBe(
            "replacement",
          );
      } finally {
        // This entire synthetic root was created by this test; no user data.
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
  it("removes an unchanged pinned directory", () => {
    const root = mkdtempSync(join(tmpdir(), "doolittle-fixture-identity-"));
    const owned = join(root, "owned");
    try {
      mkdirSync(owned);
      writeFileSync(join(owned, "sentinel"), "owned");
      removePinnedFixtureDirectory(pinFixtureDirectory(owned));
      expect(existsSync(owned)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("child IPC disconnect shutdown", () => {
  function childGuard(dispose: () => Promise<void>) {
    const ipc = new EventEmitter();
    const disposed = vi.fn(() => ipc.emit("disconnect"));
    const failed = vi.fn();
    const quit = vi.fn();
    const exit = vi.fn();
    const guard = installNativeFixtureShutdown({
      onDisconnect: (listener) => ipc.on("disconnect", listener),
      dispose,
      disposed,
      failed,
      quit,
      exit,
      timeoutMs: 25,
    });
    return { ipc, guard, disposed, failed, quit, exit };
  }
  it.each(["startup", "capture"])(
    "bounds disconnect during %s even if resource disposal hangs",
    async () => {
      vi.useFakeTimers();
      const dispose = vi.fn(() => new Promise<void>(() => {}));
      const state = childGuard(dispose);
      expect(state.guard.isClosing()).toBe(false);
      state.ipc.emit("disconnect");
      expect(state.guard.isClosing()).toBe(true);
      expect(dispose).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(26);
      expect(state.exit).toHaveBeenCalledOnce();
      expect(state.disposed).not.toHaveBeenCalled();
      expect(state.failed).not.toHaveBeenCalled();
    },
  );
  it("own graceful dispose disconnect reuses shutdown without misclassifying failure", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn(async () => {});
    const state = childGuard(dispose);
    await state.guard.shutdown();
    expect(dispose).toHaveBeenCalledOnce();
    expect(state.disposed).toHaveBeenCalledOnce();
    expect(state.quit).toHaveBeenCalledOnce();
    expect(state.failed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(26);
    expect(state.exit).toHaveBeenCalledOnce();
  });
  it("disconnect during requested hanging dispose cannot bypass the exit bound", async () => {
    vi.useFakeTimers();
    const dispose = vi.fn(() => new Promise<void>(() => {}));
    const state = childGuard(dispose);
    void state.guard.shutdown();
    state.ipc.emit("disconnect");
    await vi.advanceTimersByTimeAsync(26);
    expect(dispose).toHaveBeenCalledOnce();
    expect(state.exit).toHaveBeenCalledOnce();
  });
  it("unknown disposal failures use only the fixed failure callback", async () => {
    vi.useFakeTimers();
    const state = childGuard(async () => {
      throw new Error("CANARY_PRIVATE");
    });
    await state.guard.shutdown();
    expect(state.failed).toHaveBeenCalledExactlyOnceWith();
    expect(state.disposed).not.toHaveBeenCalled();
    expect(state.quit).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(26);
  });
});

describe("closed ordinary-Electron fixture transport", () => {
  it.each(["complete", "async", "lazy", "late"])(
    "accepts only closed capture kind %s",
    (kind) => {
      expect(
        parseNativeFixtureRequest({
          type: "capture",
          kind,
          expireAfterPng: false,
        }),
      ).toEqual({ type: "capture", kind, expireAfterPng: false });
    },
  );
  it("rejects executable/unknown IPC without exporting raw strings", () => {
    for (const message of [
      { type: "eval", script: "CANARY_PRIVATE" },
      { type: "capture", kind: "CANARY_PRIVATE", expireAfterPng: false },
      {
        type: "capture",
        kind: "complete",
        expireAfterPng: false,
        token: "CANARY_PRIVATE",
      },
      { type: "dispose", token: "CANARY_PRIVATE" },
    ])
      expect(parseNativeFixtureRequest(message)).toBeNull();
    expect(parseNativeFixtureRequest({ type: "dispose" })).toEqual({
      type: "dispose",
    });
    expect(
      parseNativeFixtureOutcome({
        type: "captured",
        capture: { ...capture, url: "CANARY_PRIVATE" },
      }),
    ).toBeNull();
    expect(
      parseNativeFixtureOutcome({
        type: "captured",
        capture: {
          ...capture,
          images: [{ alt: "CANARY_PRIVATE", loaded: true }],
        },
      }),
    ).toBeNull();
    expect(
      parseNativeFixtureOutcome({
        type: "capture-failed",
        failure: {
          phase: "first-snapshot",
          status: 502,
          error: "CANARY_PRIVATE",
          truncated: false,
          elapsedMs: 10,
          window: null,
        },
      }),
    ).toBeNull();
    expect(
      parseNativeFixtureOutcome(
        Object.defineProperty({}, "type", {
          enumerable: true,
          get() {
            throw new Error("CANARY_PRIVATE");
          },
        }),
      ),
    ).toBeNull();
  });
  it("retains the sanitized capture failure envelope", () => {
    const failure = {
      phase: "first-snapshot",
      refusalPhase: null,
      status: 502,
      error: "Rendered evidence could not be captured.",
      truncated: false,
      elapsedMs: 10,
      window: null,
    };
    expect(
      parseNativeFixtureOutcome({ type: "capture-failed", failure }),
    ).toEqual({ capture: null, failure });
  });
  it("sanitizes only startup injection flags without mutating inherited environment", () => {
    const inherited = {
      NODE_OPTIONS: "CANARY_PRIVATE",
      NODE_PATH: "CANARY_PRIVATE",
      ELECTRON_RUN_AS_NODE: "1",
      ELECTRON_EXTRA_LAUNCH_ARGS: "CANARY_PRIVATE",
      VOLATILE_TEST_VALUE: "retained",
    };
    expect(nativeFixtureEnvironment(inherited)).toEqual({
      VOLATILE_TEST_VALUE: "retained",
    });
    expect(inherited.NODE_OPTIONS).toBe("CANARY_PRIVATE");
  });
  it("waits for ready without a capture, sends one closed request, and confirms shutdown", async () => {
    const child = new SyntheticChild();
    const fixture = start(child);
    const pending = fixture.capture("complete", false);
    expect(child.send).not.toHaveBeenCalled();
    child.emit("message", { type: "ready" });
    expect(await pending).toEqual({ capture, failure: null });
    expect(child.send).toHaveBeenCalledOnce();
    expect(child.send.mock.calls[0][0]).toEqual({
      type: "capture",
      kind: "complete",
      expireAfterPng: false,
    });
    await expect(fixture.capture("async", false)).rejects.toThrow(
      "Native renderer fixture protocol failed.",
    );
    expect(await fixture.dispose()).toBe(true);
    expect(child.connected).toBe(false);
  });
  it("unknown startup errors fail statically and still allow confirmed cleanup", async () => {
    const child = new SyntheticChild();
    const fixture = start(child);
    child.emit("error", new Error("CANARY_PRIVATE"));
    await expect(fixture.capture("complete", false)).rejects.toMatchObject({
      message: "Native renderer fixture protocol failed.",
    });
    expect(await fixture.dispose()).toBe(true);
  });
  it("bounds startup waits without retry", async () => {
    vi.useFakeTimers();
    const child = new SyntheticChild();
    const fixture = start(child);
    const pending = fixture.capture("complete", false);
    const rejected = expect(pending).rejects.toThrow(
      "Native renderer fixture protocol failed.",
    );
    await vi.advanceTimersByTimeAsync(51);
    await rejected;
    expect(child.send).not.toHaveBeenCalled();
    expect(await fixture.dispose()).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a capture with no reply and rejects unknown response text statically", async () => {
    vi.useFakeTimers();
    for (const response of [
      null,
      { type: "unknown", error: "CANARY_PRIVATE" },
    ]) {
      const child = new SyntheticChild();
      child.send.mockImplementation((message, callback) => {
        callback?.(null);
        if (message.type === "capture" && response)
          child.emit("message", response);
        if (message.type === "dispose") child.close();
        return true;
      });
      const fixture = start(child);
      child.emit("message", { type: "ready" });
      const pending = fixture.capture("complete", false);
      const rejected = expect(pending).rejects.toMatchObject({
        message: "Native renderer fixture protocol failed.",
      });
      await vi.advanceTimersByTimeAsync(51);
      await rejected;
      expect(
        child.send.mock.calls.filter(([m]) => m.type === "capture"),
      ).toHaveLength(1);
      expect(await fixture.dispose()).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  });
  it("requires IPC disconnect as well as direct close and group absence", async () => {
    vi.useFakeTimers();
    const child = new SyntheticChild();
    child.send.mockImplementation(() => true);
    const fixture = start(child);
    child.emit("close", 0, null);
    const rejected = expect(fixture.dispose()).rejects.toThrow(
      "cleanup unconfirmed",
    );
    await vi.advanceTimersByTimeAsync(2021);
    await rejected;
    expect(child.connected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a direct close does not cancel owned-group TERM/KILL escalation", async () => {
    vi.useFakeTimers();
    const child = new SyntheticChild();
    let absent = false;
    const signals = vi.fn((_pid: number, signal: string) => {
      if (signal === "SIGKILL") absent = true;
    });
    const fixture = start(child, () => absent, signals);
    child.close();
    const disposed = fixture.dispose();
    await vi.advanceTimersByTimeAsync(300);
    expect(await disposed).toBe(true);
    expect(signals.mock.calls).toEqual([
      [424242, "SIGTERM"],
      [424242, "SIGKILL"],
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("unconfirmed owned-group absence fails closed even after close and IPC disconnect", async () => {
    vi.useFakeTimers();
    const child = new SyntheticChild();
    const signals = vi.fn();
    const fixture = start(
      child,
      () => {
        throw Object.assign(new Error("CANARY_PRIVATE"), { code: "EPERM" });
      },
      signals,
    );
    child.close();
    const disposed = fixture.dispose();
    const rejected = expect(disposed).rejects.toMatchObject({
      message:
        "Native renderer cleanup unconfirmed; private fixture state retained.",
    });
    await vi.advanceTimersByTimeAsync(2021);
    await rejected;
    expect(signals).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
