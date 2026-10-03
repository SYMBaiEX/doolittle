import { type ChildProcess, spawn } from "node:child_process";
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type { BrowserWindow, BrowserWindowConstructorOptions } from "electron";
import type {
  CaptureFailure,
  RasterCapture,
  RasterCase,
} from "./browser-renderer-fixture";

export type NativeFixtureOutcome =
  | { capture: RasterCapture; failure: null }
  | { capture: null; failure: CaptureFailure };
const fail = () => new Error("Native renderer fixture protocol failed.");

export type FixtureCaptureBackend =
  | "product-default"
  | "onscreen"
  | "offscreen";
export type ActualCaptureBackend = "onscreen" | "offscreen";
export type FixtureCaptureScale = 1 | 1.25 | 1.5 | 2;

export function resolveFixtureCaptureBackend(
  value: unknown,
): FixtureCaptureBackend {
  if (value === undefined || value === "product-default")
    return "product-default";
  if (value === "onscreen") return "onscreen";
  if (value === "offscreen") return "offscreen";
  throw new Error("Unknown renderer fixture backend.");
}

export function resolveFixtureCaptureScale(
  value: unknown,
): FixtureCaptureScale {
  if (value === undefined) return 2;
  if (value === "1" || value === "1.25" || value === "1.5" || value === "2")
    return Number(value) as FixtureCaptureScale;
  throw new Error("Unknown renderer fixture scale.");
}

export function actualFixtureCaptureBackend(
  options: BrowserWindowConstructorOptions,
): ActualCaptureBackend {
  return options.webPreferences?.offscreen ? "offscreen" : "onscreen";
}

export function fixtureWindowOptions(
  options: BrowserWindowConstructorOptions,
  backend: FixtureCaptureBackend,
  scale: FixtureCaptureScale = 2,
): BrowserWindowConstructorOptions {
  const selected = resolveFixtureCaptureBackend(backend);
  if (selected === "product-default") return options;
  if (selected === "onscreen") {
    if (!options.webPreferences?.offscreen) return options;
    const { offscreen: _offscreen, ...webPreferences } = options.webPreferences;
    return { ...options, webPreferences };
  }
  if (![1, 1.25, 1.5, 2].includes(scale))
    throw new Error("Unknown renderer fixture scale.");
  // CPU bitmap output with GPU composition, not software rendering. Explicit
  // OSR scale keeps the same target as the forced display-scale flag.
  return {
    ...options,
    webPreferences: {
      ...options.webPreferences,
      offscreen: { useSharedTexture: false, deviceScaleFactor: scale },
    },
  };
}

const MAX_RUNTIME_COUNT = 1000;
const MAX_RUNTIME_MS = 60_000;
const MAX_PAINT_DIMENSION = 16_384;

export interface FixtureRuntimeReceipt {
  isOffscreen: boolean | null;
  isPainting: boolean | null;
  frameRate: number | null;
  windowDestroyed: boolean | null;
  contentsDestroyed: boolean | null;
  loading: boolean | null;
  mainFrameLoading: boolean | null;
  ownedNavigationCommitted: boolean;
  readyToShowCount: number;
  readyAfterOwnedCommitCount: number;
  firstReadyMs: number | null;
  lastReadyMs: number | null;
  paintCount: number;
  paintAfterOwnedCommitCount: number;
  firstPaintMs: number | null;
  lastPaintMs: number | null;
  firstPaintAfterOwnedCommitMs: number | null;
  lastPaintAfterOwnedCommitMs: number | null;
  lastNonemptyPaintSize: { width: number; height: number } | null;
  lastNonemptyPaintAfterOwnedCommitSize: {
    width: number;
    height: number;
  } | null;
  countsCapped: boolean;
  unavailable: boolean;
}
export interface FixtureRuntimeObservation {
  constructed: FixtureRuntimeReceipt;
  atReadinessRefusal: FixtureRuntimeReceipt | null;
  preCapture: FixtureRuntimeReceipt | null;
  settled: FixtureRuntimeReceipt | null;
}

/** Passive metadata only. Post-commit paint chronology does not attest frame content. */
export function installFixtureRuntimeObservation(options: {
  window: BrowserWindow;
  isOwnedTarget: (url: string) => boolean;
  now?: () => number;
}) {
  const window = options.window;
  const contents = window.webContents;
  const now = options.now ?? (() => performance.now());
  let unavailable = false;
  const read = <T>(callback: () => T): T | null => {
    try {
      return callback();
    } catch {
      unavailable = true;
      return null;
    }
  };
  const started = read(now);
  const elapsed = () => {
    const value = read(now);
    const ms = value !== null && started !== null ? value - started : NaN;
    if (!Number.isFinite(ms) || ms < 0 || ms > MAX_RUNTIME_MS) {
      unavailable = true;
      return null;
    }
    return ms;
  };
  const boolean = (callback: () => boolean) => {
    const value = read(callback);
    if (typeof value === "boolean") return value;
    unavailable = true;
    return null;
  };
  let committed = false;
  let readyCount = 0;
  let readyAfterCommit = 0;
  let firstReady: number | null = null;
  let lastReady: number | null = null;
  let paintCount = 0;
  let paintAfterCommit = 0;
  let firstPaint: number | null = null;
  let lastPaint: number | null = null;
  let firstAfterCommit: number | null = null;
  let lastAfterCommit: number | null = null;
  let lastSize: { width: number; height: number } | null = null;
  let lastAfterCommitSize: { width: number; height: number } | null = null;
  let capped = false;
  const increment = (count: number) => {
    if (count === MAX_RUNTIME_COUNT) capped = true;
    return Math.min(count + 1, MAX_RUNTIME_COUNT);
  };
  let stopped = false;
  const listeners: Array<{
    emitter: NodeJS.EventEmitter;
    event: string;
    listener: (...args: unknown[]) => void;
  }> = [];
  const dispose = () => {
    if (stopped) return;
    stopped = true;
    for (const { emitter, event, listener } of listeners)
      read(() => emitter.removeListener(event, listener));
    listeners.length = 0;
  };
  // Keep the exact listener identity for removal, including partially failed setup.
  const add = (
    emitter: NodeJS.EventEmitter,
    event: string,
    listener: (...args: unknown[]) => void,
  ) => {
    const guarded = (...args: unknown[]) => {
      if (!stopped) read(() => listener(...args));
    };
    listeners.push({ emitter, event, listener: guarded });
    read(() => emitter.on(event, guarded));
  };
  add(contents, "did-navigate", (_event, url) => {
    committed = false;
    if (typeof url === "string")
      committed = options.isOwnedTarget(url) === true;
  });
  add(window, "ready-to-show", () => {
    readyCount = increment(readyCount);
    if (committed) readyAfterCommit = increment(readyAfterCommit);
    const ms = elapsed();
    if (readyCount === 1) firstReady = ms;
    lastReady = ms;
  });
  add(contents, "paint", (_event, _dirtyRect, image) => {
    paintCount = increment(paintCount);
    const ms = elapsed();
    if (paintCount === 1) firstPaint = ms;
    lastPaint = ms;
    if (committed) {
      paintAfterCommit = increment(paintAfterCommit);
      if (paintAfterCommit === 1) firstAfterCommit = ms;
      lastAfterCommit = ms;
    }
    // Never copy pixels, encode, sample, or retain this NativeImage.
    const native = image as Pick<Electron.NativeImage, "isEmpty" | "getSize">;
    if (native.isEmpty()) return;
    const { width, height } = native.getSize();
    if (
      ![width, height].every(
        (value) =>
          Number.isInteger(value) && value > 0 && value <= MAX_PAINT_DIMENSION,
      )
    ) {
      unavailable = true;
      return;
    }
    lastSize = { width, height };
    if (committed) lastAfterCommitSize = { width, height };
  });
  add(window, "closed", dispose);
  add(contents, "destroyed", dispose);
  if (unavailable) dispose();
  const snapshot = (): FixtureRuntimeReceipt => {
    const isOffscreen = boolean(() => contents.isOffscreen());
    const isPainting =
      isOffscreen === true ? boolean(() => contents.isPainting()) : null;
    let frameRate: number | null = null;
    if (isOffscreen === true) {
      const rate = read(() => contents.getFrameRate());
      if (
        typeof rate === "number" &&
        Number.isInteger(rate) &&
        rate >= 1 &&
        rate <= 240
      )
        frameRate = rate;
      else unavailable = true;
    }
    const windowDestroyed = boolean(() => window.isDestroyed());
    const contentsDestroyed = boolean(() => contents.isDestroyed());
    const loading = boolean(() => contents.isLoading());
    const mainFrameLoading = boolean(() => contents.isLoadingMainFrame());
    return {
      isOffscreen,
      isPainting,
      frameRate,
      windowDestroyed,
      contentsDestroyed,
      loading,
      mainFrameLoading,
      ownedNavigationCommitted: committed,
      readyToShowCount: readyCount,
      readyAfterOwnedCommitCount: readyAfterCommit,
      firstReadyMs: firstReady,
      lastReadyMs: lastReady,
      paintCount,
      paintAfterOwnedCommitCount: paintAfterCommit,
      firstPaintMs: firstPaint,
      lastPaintMs: lastPaint,
      firstPaintAfterOwnedCommitMs: firstAfterCommit,
      lastPaintAfterOwnedCommitMs: lastAfterCommit,
      lastNonemptyPaintSize: lastSize,
      lastNonemptyPaintAfterOwnedCommitSize: lastAfterCommitSize,
      countsCapped: capped,
      unavailable,
    };
  };
  const receipts: FixtureRuntimeObservation = {
    constructed: snapshot(),
    atReadinessRefusal: null,
    preCapture: null,
    settled: null,
  };
  return {
    receipts,
    readinessRefused: () => {
      // Only called after the bridge's closed refusal enum was observed. This
      // is not native capture settlement, and may observe a destroyed receiver.
      receipts.atReadinessRefusal = snapshot();
      dispose();
    },
    beforeCapture: () => {
      receipts.preCapture = snapshot();
    },
    settle: () => {
      if (receipts.settled === null) receipts.settled = snapshot();
      dispose();
    },
    dispose,
  };
}

export function pinFixtureDirectory(path: string) {
  const canonical = realpathSync(path);
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("Fixture directory identity unavailable.");
  return { path, canonical, dev: stat.dev, ino: stat.ino };
}

/** Refuse missing, redirected or replaced test roots rather than deleting them. */
export function removePinnedFixtureDirectory(
  identity: ReturnType<typeof pinFixtureDirectory>,
) {
  try {
    const stat = lstatSync(identity.path);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== identity.dev ||
      stat.ino !== identity.ino ||
      realpathSync(identity.path) !== identity.canonical
    )
      throw new Error();
  } catch {
    throw new Error(
      "Fixture directory identity changed; private state retained.",
    );
  }
  rmSync(identity.path, { recursive: true, force: false });
}

/** Child-only abort guard, installed before readiness; never starts a capture. */
export function installNativeFixtureShutdown(options: {
  onDisconnect: (listener: () => void) => void;
  dispose: () => Promise<void>;
  disposed: () => void;
  failed: () => void;
  quit: () => void;
  exit: () => void;
  timeoutMs?: number;
}) {
  let pending: Promise<void> | undefined;
  const observe = (callback: () => void) => {
    try {
      callback();
    } catch {
      // Shutdown diagnostics must not export callback/native errors.
    }
  };
  const shutdown = () => {
    pending ??= (async () => {
      // Keep the exit bound even when disposal or graceful quit hangs. Own
      // disconnect after disposed re-enters this same operation, not a failure.
      setTimeout(() => observe(options.exit), options.timeoutMs ?? 2_000);
      try {
        await options.dispose();
        observe(options.disposed);
      } catch {
        observe(options.failed);
      } finally {
        observe(options.quit);
      }
    })();
    return pending;
  };
  options.onDisconnect(() => void shutdown());
  return { shutdown, isClosing: () => pending !== undefined };
}
const keys = (
  value: unknown,
  names: string[],
): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).length === names.length &&
  names.every((key) => Object.hasOwn(value, key));
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const nullableNumber = (value: unknown) => value === null || number(value);
const rectangle = (v: unknown): boolean =>
  keys(v, ["x", "y", "width", "height"]) &&
  Object.values(v).every(nullableNumber);
const measurement = (v: unknown): boolean =>
  v === null ||
  (keys(v, ["bounds", "contentBounds", "zoomFactor", "display"]) &&
    (v.bounds === null || rectangle(v.bounds)) &&
    (v.contentBounds === null || rectangle(v.contentBounds)) &&
    nullableNumber(v.zoomFactor) &&
    (v.display === null ||
      (keys(v.display, ["bounds", "workArea", "scaleFactor"]) &&
        rectangle(v.display.bounds) &&
        rectangle(v.display.workArea) &&
        nullableNumber(v.display.scaleFactor))));
const phase = (v: unknown) =>
  v === null ||
  [
    "wait-for-render",
    "rendered-facts",
    "capture-page",
    "png-encode",
    "complete",
  ].includes(v as string);
const viewport = (v: unknown, dpr = false): boolean =>
  keys(
    v,
    dpr ? ["width", "height", "deviceScaleFactor"] : ["width", "height"],
  ) && Object.values(v).every(number);
const boundedInteger = (value: unknown, min: number, max: number) =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;
const runtimeReceipt = (value: unknown): boolean => {
  if (
    !keys(value, [
      "isOffscreen",
      "isPainting",
      "frameRate",
      "windowDestroyed",
      "contentsDestroyed",
      "loading",
      "mainFrameLoading",
      "ownedNavigationCommitted",
      "readyToShowCount",
      "readyAfterOwnedCommitCount",
      "firstReadyMs",
      "lastReadyMs",
      "paintCount",
      "paintAfterOwnedCommitCount",
      "firstPaintMs",
      "lastPaintMs",
      "firstPaintAfterOwnedCommitMs",
      "lastPaintAfterOwnedCommitMs",
      "lastNonemptyPaintSize",
      "lastNonemptyPaintAfterOwnedCommitSize",
      "countsCapped",
      "unavailable",
    ])
  )
    return false;
  const booleans = [
    value.isOffscreen,
    value.isPainting,
    value.windowDestroyed,
    value.contentsDestroyed,
    value.loading,
    value.mainFrameLoading,
  ];
  const times = [
    value.firstReadyMs,
    value.lastReadyMs,
    value.firstPaintMs,
    value.lastPaintMs,
    value.firstPaintAfterOwnedCommitMs,
    value.lastPaintAfterOwnedCommitMs,
  ];
  const size = (v: unknown) =>
    v === null ||
    (keys(v, ["width", "height"]) &&
      Object.values(v).every((n) => boundedInteger(n, 1, MAX_PAINT_DIMENSION)));
  return (
    booleans.every((v) => v === null || typeof v === "boolean") &&
    [
      value.ownedNavigationCommitted,
      value.countsCapped,
      value.unavailable,
    ].every((v) => typeof v === "boolean") &&
    times.every(
      (v) =>
        v === null ||
        (number(v) && (v as number) >= 0 && (v as number) <= MAX_RUNTIME_MS),
    ) &&
    [
      value.readyToShowCount,
      value.readyAfterOwnedCommitCount,
      value.paintCount,
      value.paintAfterOwnedCommitCount,
    ].every((v) => boundedInteger(v, 0, MAX_RUNTIME_COUNT)) &&
    (value.readyAfterOwnedCommitCount as number) <=
      (value.readyToShowCount as number) &&
    (value.paintAfterOwnedCommitCount as number) <=
      (value.paintCount as number) &&
    size(value.lastNonemptyPaintSize) &&
    size(value.lastNonemptyPaintAfterOwnedCommitSize) &&
    (value.frameRate === null || boundedInteger(value.frameRate, 1, 240)) &&
    (value.isOffscreen === true ||
      (value.isPainting === null && value.frameRate === null)) &&
    (value.unavailable === true ||
      [
        value.isOffscreen,
        value.windowDestroyed,
        value.contentsDestroyed,
        value.loading,
        value.mainFrameLoading,
      ].every((v) => v !== null)) &&
    (value.unavailable === true ||
      value.isOffscreen !== true ||
      (value.isPainting !== null && value.frameRate !== null))
  );
};
const runtimeObservation = (value: unknown): boolean =>
  keys(value, ["constructed", "atReadinessRefusal", "preCapture", "settled"]) &&
  runtimeReceipt(value.constructed) &&
  (value.atReadinessRefusal === null ||
    runtimeReceipt(value.atReadinessRefusal)) &&
  (value.preCapture === null || runtimeReceipt(value.preCapture)) &&
  (value.settled === null || runtimeReceipt(value.settled));
export function parseNativeFixtureRequest(
  value: unknown,
):
  | { type: "dispose" }
  | { type: "capture"; kind: RasterCase; expireAfterPng: boolean }
  | null {
  try {
    if (keys(value, ["type"]) && value.type === "dispose")
      return { type: "dispose" };
    if (
      keys(value, ["type", "kind", "expireAfterPng"]) &&
      value.type === "capture" &&
      typeof value.kind === "string" &&
      ["complete", "async", "lazy", "late"].includes(value.kind) &&
      typeof value.expireAfterPng === "boolean"
    )
      return {
        type: "capture",
        kind: value.kind as RasterCase,
        expireAfterPng: value.expireAfterPng,
      };
  } catch {
    /* Untrusted protocol objects never become executable commands. */
  }
  return null;
}
const diagnostic = (v: unknown): boolean =>
  v === null ||
  (keys(v, [
    "backend",
    "loaded",
    "closed",
    "unresponsive",
    "mainFrameLoadErrorCode",
    "renderProcessGone",
    "constructor",
    "forcedScaleFactor",
    "constructed",
    "atCapture",
    "runtime",
    "factsViewport",
    "png",
    "phase",
    "failedPhase",
    "nativeCapture",
    "calls",
    "observationUnavailable",
  ]) &&
    (v.backend === "onscreen" || v.backend === "offscreen") &&
    [v.loaded, v.closed, v.unresponsive, v.observationUnavailable].every(
      (b) => typeof b === "boolean",
    ) &&
    nullableNumber(v.mainFrameLoadErrorCode) &&
    nullableNumber(v.forcedScaleFactor) &&
    (v.renderProcessGone === null ||
      (keys(v.renderProcessGone, ["reason", "exitCode"]) &&
        [
          "clean-exit",
          "abnormal-exit",
          "killed",
          "crashed",
          "oom",
          "launch-failed",
          "integrity-failure",
          "memory-eviction",
        ].includes(v.renderProcessGone.reason as string) &&
        number(v.renderProcessGone.exitCode))) &&
    keys(v.constructor, ["width", "height"]) &&
    Object.values(v.constructor).every(nullableNumber) &&
    measurement(v.constructed) &&
    measurement(v.atCapture) &&
    (v.runtime === null
      ? v.observationUnavailable === true
      : runtimeObservation(v.runtime)) &&
    (v.factsViewport === null ||
      (keys(v.factsViewport, ["width", "height", "deviceScaleFactor"]) &&
        Object.values(v.factsViewport).every(nullableNumber))) &&
    (v.png === null ||
      (keys(v.png, ["bytes", "ihdr"]) &&
        number(v.png.bytes) &&
        (v.png.ihdr === null || viewport(v.png.ihdr)))) &&
    phase(v.phase) &&
    phase(v.failedPhase) &&
    (v.nativeCapture === null ||
      (keys(v.nativeCapture, ["settlement", "durationMs", "failure"]) &&
        ["fulfilled", "sync-throw", "promise-reject"].includes(
          v.nativeCapture.settlement as string,
        ) &&
        nullableNumber(v.nativeCapture.durationMs) &&
        (v.nativeCapture.failure === null ||
          [
            "surface-unavailable",
            "unknown",
            "not-implemented",
            "frame-gone",
            "copy-timeout",
            "embedding-token-changed",
            "viz-empty-bitmap",
            "viz-error",
            "unclassified",
          ].includes(v.nativeCapture.failure as string)))) &&
    keys(v.calls, [
      "executeJavaScript",
      "waitForRender",
      "renderedFacts",
      "capturePage",
      "pngEncode",
    ]) &&
    Object.values(v.calls).every(number));
const readinessRefusalDiagnostic = (value: unknown): boolean => {
  if (value === null) return true; // No native observation is claimed.
  if (!diagnostic(value)) return false;
  const receipt = value as NonNullable<CaptureFailure["window"]>;
  return (
    receipt.phase === "wait-for-render" &&
    receipt.failedPhase === null &&
    receipt.nativeCapture === null &&
    receipt.atCapture === null &&
    receipt.factsViewport === null &&
    receipt.png === null &&
    receipt.calls.executeJavaScript === 1 &&
    receipt.calls.waitForRender === 1 &&
    receipt.calls.renderedFacts === 0 &&
    receipt.calls.capturePage === 0 &&
    receipt.calls.pngEncode === 0 &&
    (receipt.runtime === null ||
      (receipt.runtime.atReadinessRefusal !== null &&
        receipt.runtime.preCapture === null &&
        receipt.runtime.settled === null))
  );
};

/** Reject unknown fields/text rather than forwarding arbitrary IPC evidence. */
export function parseNativeFixtureOutcome(
  value: unknown,
): NativeFixtureOutcome | null {
  try {
    if (keys(value, ["type", "capture"]) && value.type === "captured") {
      const v = value.capture;
      if (
        keys(v, [
          "png",
          "width",
          "height",
          "viewport",
          "factsViewport",
          "bitmapBytes",
          "sentinelBGRA",
          "hidden",
          "privatePartition",
          "blockedRequests",
          "captureMode",
          "images",
          "diagnostic",
        ]) &&
        typeof v.png === "string" &&
        v.png.length <= 14 * 1024 * 1024 &&
        /^[A-Za-z0-9+/]*={0,2}$/.test(v.png) &&
        [v.width, v.height, v.bitmapBytes, v.blockedRequests].every(number) &&
        viewport(v.viewport) &&
        viewport(v.factsViewport, true) &&
        Array.isArray(v.sentinelBGRA) &&
        v.sentinelBGRA.length === 4 &&
        v.sentinelBGRA.every(number) &&
        typeof v.hidden === "boolean" &&
        typeof v.privatePartition === "boolean" &&
        v.captureMode === "rendered-page" &&
        Array.isArray(v.images) &&
        v.images.length <= 1 &&
        v.images.every(
          (image) =>
            keys(image, ["alt", "loaded"]) &&
            image.alt === "Owned synthetic raster" &&
            typeof image.loaded === "boolean",
        ) &&
        diagnostic(v.diagnostic)
      )
        return { capture: v as unknown as RasterCapture, failure: null };
    }
    if (keys(value, ["type", "failure"]) && value.type === "capture-failed") {
      const v = value.failure;
      if (
        keys(v, [
          "phase",
          "refusalPhase",
          "status",
          "error",
          "truncated",
          "elapsedMs",
          "window",
        ]) &&
        ["open", "first-snapshot"].includes(v.phase as string) &&
        (v.refusalPhase === null ||
          (v.refusalPhase === "native-readiness" &&
            v.phase === "first-snapshot" &&
            v.status === 502 &&
            v.error === "Rendered evidence could not be captured." &&
            readinessRefusalDiagnostic(v.window))) &&
        number(v.status) &&
        typeof v.truncated === "boolean" &&
        number(v.elapsedMs) &&
        diagnostic(v.window) &&
        [
          "The managed app could not be rendered.",
          "Rendered evidence could not be captured.",
          "The managed app is no longer available in this workspace.",
          "Capture bridge authorization is required.",
          "empty-error-body",
          "unreadable-error-body",
          "unrecognized-error-body",
        ].includes(v.error as string)
      )
        return { capture: null, failure: v as unknown as CaptureFailure };
    }
    return null;
  } catch {
    return null;
  }
}

export function nativeFixtureEnvironment(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const value = { ...env };
  // Ordinary Electron entry: inherited Node injection/run-as-node flags would
  // change the executable or import path. Never print the inherited environment.
  for (const key of [
    "NODE_OPTIONS",
    "NODE_PATH",
    "ELECTRON_RUN_AS_NODE",
    "ELECTRON_EXTRA_LAUNCH_ARGS",
  ])
    delete value[key];
  return value;
}

export function startNativeRendererFixture(options: {
  entry: string;
  ownedDir: string;
  spawnChild?: () => ChildProcess;
  probeGroupAbsent?: (pid: number) => boolean;
  signalGroup?: (pid: number, signal: NodeJS.Signals) => void;
  timeoutMs?: number;
  killGraceMs?: number;
  captureScale?: FixtureCaptureScale;
}) {
  const captureScale =
    options.captureScale ??
    resolveFixtureCaptureScale(process.env.DOOLITTLE_RENDER_CAPTURE_SCALE);
  if (![1, 1.25, 1.5, 2].includes(captureScale)) throw fail();
  const timeout = options.timeoutMs ?? 20_000;
  let child: ChildProcess;
  try {
    child = options.spawnChild
      ? options.spawnChild()
      : spawn(
          createRequire(resolve("apps/desktop/package.json"))(
            "electron",
          ) as string,
          [
            options.entry,
            `--user-data-dir=${join(options.ownedDir, "profile")}`,
            `--force-device-scale-factor=${captureScale}`,
            "--doolittle-renderer-fixture-ipc",
            ...(process.platform === "linux" ? ["--no-sandbox"] : []),
          ],
          {
            cwd: process.cwd(),
            env: {
              ...nativeFixtureEnvironment(process.env),
              DOOLITTLE_RENDER_CAPTURE_SCALE: String(captureScale),
            },
            detached: process.platform !== "win32",
            stdio: ["ignore", "ignore", "ignore", "ipc"],
          },
        );
  } catch {
    throw fail();
  }
  let closed = false;
  let used = false;
  let ready = false;
  let broken = false;
  let disposing = false;
  let waiter:
    | {
        resolve: (v: unknown) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  let cleanup: Promise<boolean> | undefined;
  const reject = () => {
    broken = true;
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.reject(fail());
      waiter = undefined;
    }
  };
  const wait = () =>
    new Promise<unknown>((resolve, rejectPromise) => {
      if (broken || closed || waiter) {
        rejectPromise(fail());
        return;
      }
      waiter = {
        resolve,
        reject: rejectPromise,
        timer: setTimeout(reject, timeout),
      };
    });
  const startup = wait();
  // Avoid an unhandled startup rejection while the caller owns finally cleanup.
  void startup.catch(() => {});
  child.on("message", (message: unknown) => {
    try {
      if (disposing && keys(message, ["type"]) && message.type === "disposed")
        return;
      if (!waiter) {
        reject();
        return;
      }
      if (!ready) {
        if (!keys(message, ["type"]) || message.type !== "ready") {
          reject();
          return;
        }
        ready = true;
      } else if (!parseNativeFixtureOutcome(message)) {
        reject();
        return;
      }
      clearTimeout(waiter.timer);
      waiter.resolve(message);
      waiter = undefined;
    } catch {
      reject();
    }
  });
  child.on("error", reject);
  child.on("disconnect", reject);
  child.on("close", () => {
    closed = true;
    reject();
  });
  const send = (value: unknown) => {
    try {
      child.send(value as Parameters<ChildProcess["send"]>[0], (error) => {
        if (error) reject();
      });
    } catch {
      reject();
    }
  };
  const absent = () => {
    if (child.pid === undefined) return closed;
    try {
      if (options.probeGroupAbsent) return options.probeGroupAbsent(child.pid);
      if (process.platform === "win32") return false;
      process.kill(-child.pid, 0);
      return false;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ESRCH";
    }
  };
  const signal = (value: NodeJS.Signals) => {
    try {
      if (child.pid === undefined) return;
      if (options.signalGroup) options.signalGroup(child.pid, value);
      else if (process.platform !== "win32") process.kill(-child.pid, value);
      else child.kill(value);
    } catch {
      /* Absence must still be positively confirmed. */
    }
  };
  return {
    async capture(
      kind: RasterCase,
      expireAfterPng: boolean,
    ): Promise<NativeFixtureOutcome> {
      if (used) throw fail();
      used = true;
      await startup;
      if (broken || closed) throw fail();
      const pending = wait();
      send({ type: "capture", kind, expireAfterPng });
      const result = parseNativeFixtureOutcome(await pending);
      if (!result) throw fail();
      return result;
    },
    dispose(): Promise<boolean> {
      cleanup ??= (async () => {
        // Dispose is a closed command, not arbitrary code, and cannot authorize
        // directory deletion: child close + IPC close + group absence must hold.
        disposing = true;
        reject();
        if (child.connected) send({ type: "dispose" });
        return await new Promise<boolean>((resolveCleanup) => {
          const started = performance.now();
          let term = false;
          let killed = false;
          const tick = () => {
            const elapsed = performance.now() - started;
            if (closed && !child.connected && absent()) {
              clearInterval(timer);
              resolveCleanup(true);
              return;
            }
            if (!term && elapsed >= (options.killGraceMs ?? 1_000)) {
              term = true;
              signal("SIGTERM");
            }
            if (!killed && elapsed >= (options.killGraceMs ?? 1_000) + 250) {
              killed = true;
              signal("SIGKILL");
            }
            if (elapsed >= (options.killGraceMs ?? 1_000) + 2_000) {
              clearInterval(timer);
              resolveCleanup(false);
            }
          };
          const timer = setInterval(tick, 10);
          tick();
        });
      })();
      return cleanup.then((safe) => {
        if (!safe)
          throw new Error(
            "Native renderer cleanup unconfirmed; private fixture state retained.",
          );
        return safe;
      });
    },
  };
}
