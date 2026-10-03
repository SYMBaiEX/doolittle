import { describe, expect, it, vi } from "vitest";
import {
  classifyNativeCaptureFailure,
  type NativeCaptureDiagnostic,
  observeNativeCapture,
} from "./native-capture-diagnostic";

describe("privacy-safe native capture diagnostics", () => {
  it.each([
    [
      "Current display surface not available for capture",
      "surface-unavailable",
    ],
    ["Unknown", "unknown"],
    ["Not implemented", "not-implemented"],
    ["Frame Gone", "frame-gone"],
    ["Timeout", "copy-timeout"],
    ["EmbeddingTokenChanged", "embedding-token-changed"],
    ["VizSentEmptyBitmap", "viz-empty-bitmap"],
    ["UnknownVizError", "viz-error"],
  ])(
    "classifies only exact pinned own-data message %s",
    (message, expected) => {
      expect(classifyNativeCaptureFailure(new Error(message))).toBe(expected);
      expect(
        classifyNativeCaptureFailure(new Error(`${message} CANARY_PRIVATE`)),
      ).toBe("unclassified");
    },
  );

  it("does not invoke accessors, inherited messages, or coercion", () => {
    const getter = vi.fn(() => "Timeout");
    const accessor = Object.defineProperty({}, "message", { get: getter });
    const coercion = vi.fn(() => "Timeout");
    const errors = [
      accessor,
      Object.create({ message: "Timeout" }),
      { message: { toString: coercion } },
      "Timeout",
      null,
      new Proxy(
        {},
        {
          getOwnPropertyDescriptor: () => {
            throw new Error("CANARY_PRIVATE");
          },
        },
      ),
    ];
    for (const error of errors)
      expect(classifyNativeCaptureFailure(error)).toBe("unclassified");
    expect(getter).not.toHaveBeenCalled();
    expect(coercion).not.toHaveBeenCalled();
  });

  it("retains the native receiver, args, one call, promise, and fulfilled image identity", async () => {
    const receiver = {};
    const options = { stayHidden: true, stayAwake: false };
    const image = {};
    const pending = Promise.resolve(image);
    const native = vi.fn(function (this: object, ...args: unknown[]) {
      expect(this).toBe(receiver);
      expect(args).toEqual([undefined, options]);
      expect(args[1]).toBe(options);
      return pending;
    });
    const observed = vi.fn();
    const clock = vi.fn().mockReturnValueOnce(12).mockReturnValueOnce(37);
    const result = observeNativeCapture(
      native,
      receiver,
      [undefined, options],
      observed,
      clock,
    );
    expect(result).toBe(pending);
    expect(await result).toBe(image);
    expect(native).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledExactlyOnceWith({
      settlement: "fulfilled",
      durationMs: 25,
      failure: null,
    });
  });

  it("keeps promise rejection identity and exports no unknown error content", async () => {
    const error = new Error("CANARY_PRIVATE_URL_TOKEN_PATH");
    const pending = Promise.reject(error);
    const native = vi.fn(() => pending);
    const observed: NativeCaptureDiagnostic[] = [];
    const clock = vi.fn().mockReturnValueOnce(4).mockReturnValueOnce(9);
    const result = observeNativeCapture(
      native,
      {},
      [],
      (value) => observed.push(value),
      clock,
    );
    expect(result).toBe(pending);
    await expect(result).rejects.toBe(error);
    expect(native).toHaveBeenCalledOnce();
    expect(observed).toEqual([
      { settlement: "promise-reject", durationMs: 5, failure: "unclassified" },
    ]);
    expect(JSON.stringify(observed)).not.toContain("CANARY_PRIVATE");
  });

  it("classifies a sync throw while rethrowing the original error", () => {
    const error = new Error(
      "Current display surface not available for capture",
    );
    const native = vi.fn(() => {
      throw error;
    });
    const observed = vi.fn();
    const clock = vi.fn().mockReturnValueOnce(2).mockReturnValueOnce(2.5);
    let thrown: unknown;
    try {
      observeNativeCapture(native, {}, [], observed, clock);
    } catch (caught) {
      thrown = caught;
    }
    expect(thrown).toBe(error);
    expect(native).toHaveBeenCalledOnce();
    expect(observed).toHaveBeenCalledExactlyOnceWith({
      settlement: "sync-throw",
      durationMs: 0.5,
      failure: "surface-unavailable",
    });
  });

  it.each(["fulfilled", "promise-reject", "sync-throw"])(
    "diagnostic failures cannot substitute %s",
    async (kind) => {
      const error = new Error("Timeout");
      const image = {};
      const pending =
        kind === "promise-reject"
          ? Promise.reject(error)
          : Promise.resolve(image);
      const native = vi.fn(() => {
        if (kind === "sync-throw") throw error;
        return pending;
      });
      const observer = () => {
        throw new Error("CANARY_OBSERVER");
      };
      const clock = () => {
        throw new Error("CANARY_CLOCK");
      };
      if (kind === "sync-throw") {
        let thrown: unknown;
        try {
          observeNativeCapture(native, {}, [], observer, clock);
        } catch (caught) {
          thrown = caught;
        }
        expect(thrown).toBe(error);
      } else {
        const result = observeNativeCapture(native, {}, [], observer, clock);
        expect(result).toBe(pending);
        if (kind === "promise-reject") await expect(result).rejects.toBe(error);
        else expect(await result).toBe(image);
      }
      expect(native).toHaveBeenCalledOnce();
    },
  );

  it.each([NaN, Infinity, -1])(
    "omits invalid elapsed duration %s",
    async (end) => {
      const observed = vi.fn();
      const clock = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(end);
      await observeNativeCapture(
        () => Promise.resolve({}),
        {},
        [],
        observed,
        clock,
      );
      expect(observed).toHaveBeenCalledExactlyOnceWith({
        settlement: "fulfilled",
        durationMs: null,
        failure: null,
      });
    },
  );
});
