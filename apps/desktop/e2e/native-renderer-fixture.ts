import { type ChildProcess, spawn } from "node:child_process";
import { lstatSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import type {
  CaptureFailure,
  RasterCapture,
  RasterCase,
} from "./browser-renderer-fixture";

export type NativeFixtureOutcome =
  | { capture: RasterCapture; failure: null }
  | { capture: null; failure: CaptureFailure };
const fail = () => new Error("Native renderer fixture protocol failed.");

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
    "loaded",
    "closed",
    "unresponsive",
    "mainFrameLoadErrorCode",
    "renderProcessGone",
    "constructor",
    "forcedScaleFactor",
    "constructed",
    "atCapture",
    "factsViewport",
    "png",
    "phase",
    "failedPhase",
    "nativeCapture",
    "calls",
    "observationUnavailable",
  ]) &&
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
          "status",
          "error",
          "truncated",
          "elapsedMs",
          "window",
        ]) &&
        ["open", "first-snapshot"].includes(v.phase as string) &&
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
}) {
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
            "--force-device-scale-factor=2",
            "--doolittle-renderer-fixture-ipc",
            ...(process.platform === "linux" ? ["--no-sandbox"] : []),
          ],
          {
            cwd: process.cwd(),
            env: nativeFixtureEnvironment(process.env),
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
