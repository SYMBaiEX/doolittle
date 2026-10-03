import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WAIT_FOR_RENDER_SCRIPT } from "./browser-render-facts";

function image(overrides: Partial<ReturnType<typeof imageDefaults>> = {}) {
  return { ...imageDefaults(), ...overrides };
}

function imageDefaults() {
  return {
    complete: true,
    naturalWidth: 4096,
    currentSrc: "http://fixture/image.png",
    src: "http://fixture/image.png",
    srcset: "",
    decode: vi.fn(async (): Promise<void> => {}),
    getBoundingClientRect: () => ({
      width: 640,
      height: 640,
      top: 0,
      left: 0,
      right: 640,
      bottom: 640,
    }),
  };
}

function startWait(
  images: ArrayLike<ReturnType<typeof image>>,
  fontsReady: Promise<unknown> = Promise.resolve(),
  animate = true,
  now = () => Date.now(),
) {
  vi.useFakeTimers();
  const done = vi.fn();
  const waiting = runInNewContext(WAIT_FOR_RENDER_SCRIPT, {
    document: { images, fonts: { ready: fontsReady } },
    innerWidth: 1280,
    innerHeight: 720,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    performance: { now },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (callback: () => void) =>
      setTimeout(animate ? callback : () => {}, 16),
    cancelAnimationFrame: clearTimeout,
  }) as Promise<void>;
  void waiting.then(done);
  return { waiting, done };
}

afterEach(() => vi.useRealTimers());

describe("bounded rendered-image readiness", () => {
  it("decodes already complete images and allows post-decode paint settling", async () => {
    const raster = image();
    raster.decode.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100)),
    );
    const { waiting, done } = startWait([raster]);
    await vi.advanceTimersByTimeAsync(349);
    expect(raster.decode).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    await waiting;
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rediscovers a late visible image before the stability window ends", async () => {
    const images: ReturnType<typeof image>[] = [];
    const { waiting, done } = startWait(images);
    const late = image();
    setTimeout(() => images.push(late), 75);
    await vi.advanceTimersByTimeAsync(300);
    expect(late.decode).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("redecodes source changes and restarts settling", async () => {
    const raster = image();
    const { waiting, done } = startWait([raster]);
    setTimeout(() => {
      raster.src = "http://fixture/replacement.png";
    }, 200);
    await vi.advanceTimersByTimeAsync(400);
    expect(raster.decode).toHaveBeenCalledTimes(2);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores offscreen images and settles even when a visible image is broken", async () => {
    const broken = image({
      complete: true,
      naturalWidth: 0,
      decode: vi.fn(async () => {
        throw new Error("Broken fixture raster");
      }),
    });
    const offscreen = image({
      getBoundingClientRect: () => ({
        width: 640,
        height: 640,
        top: 800,
        bottom: 1440,
        left: 0,
        right: 640,
      }),
    });
    const { waiting } = startWait([broken, offscreen]);
    await vi.advanceTimersByTimeAsync(400);
    await waiting;
    expect(broken.decode).toHaveBeenCalledOnce();
    expect(offscreen.decode).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("finishes stalled decoding at the original deadline and late continuations do nothing", async () => {
    let decoded: (() => void) | undefined;
    const raster = image({
      complete: false,
      decode: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            decoded = resolve;
          }),
      ),
    });
    const { waiting, done } = startWait([raster]);
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    decoded?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds discovery on an image-heavy live collection without materializing it", async () => {
    const inspected = new Set<number>();
    let rectCalls = 0;
    const offscreen = image({
      getBoundingClientRect: () => {
        rectCalls++;
        return {
          width: 640,
          height: 640,
          top: 800,
          bottom: 1440,
          left: 0,
          right: 640,
        };
      },
    });
    const images = new Proxy(
      { length: 1_000_000 },
      {
        get(target, property) {
          if (property === "length") return target.length;
          if (typeof property === "string" && /^[0-9]+$/.test(property)) {
            const index = Number(property);
            if (index >= 200) throw new Error("Unbounded image discovery");
            inspected.add(index);
            return offscreen;
          }
          throw new Error(
            "Image collection must not be materialized or iterated",
          );
        },
      },
    ) as ArrayLike<ReturnType<typeof image>>;
    const { waiting, done } = startWait(images);
    await vi.advanceTimersByTimeAsync(400);
    await waiting;
    expect(inspected.size).toBe(200);
    expect(rectCalls).toBeLessThanOrEqual(200 * 14);
    expect(offscreen.decode).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    const callsAtResolution = rectCalls;
    await vi.advanceTimersByTimeAsync(2000);
    expect(rectCalls).toBe(callsAtResolution);
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("checks elapsed budget between costly synchronous image inspections", async () => {
    let rendererWorkMs = 0;
    let inspections = 0;
    const costly = image({
      getBoundingClientRect: () => {
        rendererWorkMs += 800;
        inspections++;
        return {
          width: 640,
          height: 640,
          top: 0,
          bottom: 640,
          left: 0,
          right: 640,
        };
      },
    });
    const { waiting, done } = startWait(
      Array.from({ length: 1000 }, () => costly),
      Promise.resolve(),
      true,
      () => Date.now() + rendererWorkMs,
    );
    await vi.advanceTimersByTimeAsync(0);
    await waiting;
    // An individual call may overrun: the timer is not renderer-JS preemption.
    // Once control returns, stop discovery immediately and clean up all work.
    expect(inspections).toBe(2);
    expect(costly.decode).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(inspections).toBe(2);
    expect(done).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["fonts", "animation frames"])(
    "does not hang on stalled %s",
    async (kind) => {
      const { waiting, done } = startWait(
        [image()],
        kind === "fonts" ? new Promise(() => {}) : Promise.resolve(),
        kind !== "animation frames",
      );
      await vi.advanceTimersByTimeAsync(1499);
      expect(done).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(done).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
