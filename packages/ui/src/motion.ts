import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const LIQUID_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
type Position = Pick<DOMRect, "left" | "top" | "width" | "height">;

/** Moves the existing surface, never a screenshot or a second interactive copy. */
export function createLayoutMotion(element: HTMLElement) {
  let previous: Position | undefined;
  let scope: string | undefined;
  let animation: Animation | undefined;
  const settle = () => {
    animation?.cancel();
    animation = undefined;
    previous = element.getBoundingClientRect();
  };
  return {
    update(nextScope: string, reduced: boolean, duration: number) {
      // Capture the visible position before interrupting an in-flight move.
      const origin = animation ? element.getBoundingClientRect() : previous;
      animation?.cancel();
      animation = undefined;
      const target = element.getBoundingClientRect();
      const sameScope = scope === nextScope;
      scope = nextScope;
      previous = target;
      if (
        reduced ||
        duration <= 0 ||
        !sameScope ||
        !origin?.width ||
        !origin.height ||
        !target.width ||
        !target.height ||
        typeof element.animate !== "function"
      )
        return;
      const x = origin.left - target.left;
      const y = origin.top - target.top;
      if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
      animation = element.animate(
        [
          { transform: `translate(${x}px, ${y}px)` },
          { transform: "translate(0, 0)" },
        ],
        { duration, easing: LIQUID_EASE },
      );
      const running = animation;
      running.onfinish = () => {
        if (animation === running) animation = undefined;
      };
    },
    settle,
    measure() {
      if (!animation) previous = element.getBoundingClientRect();
    },
    dispose() {
      animation?.cancel();
      animation = undefined;
      previous = undefined;
    },
  };
}

/** Closing surfaces become inert immediately; a short exit may finish visually. */
export function useSurfacePresence(open: boolean) {
  const [retained, setRetained] = useState(open);
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    if (!retained) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const configured = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        "--motion-duration",
      ),
    );
    const delay = Number.isFinite(configured)
      ? Math.min(180, Math.max(0, configured * 1.5))
      : 180;
    if (query.matches || delay === 0) {
      setRetained(false);
      return;
    }
    const close = () => setRetained(false);
    const timeout = window.setTimeout(close, delay);
    query.addEventListener("change", close, { once: true });
    return () => {
      window.clearTimeout(timeout);
      query.removeEventListener("change", close);
    };
  }, [open, retained]);
  return {
    present: open || retained,
    state: open ? "open" : "closed",
  } as const;
}

/** Presentation-only FLIP movement; ownership changes and resizes settle instantly. */
export function useLiquidLayout(
  ref: RefObject<HTMLElement | null>,
  layoutKey: string,
  scopeKey: string,
) {
  const controller = useRef<ReturnType<typeof createLayoutMotion> | null>(null);
  const preference = useRef<MediaQueryList | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const motion = createLayoutMotion(element);
    controller.current = motion;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.current = query;
    const settle = () => motion.settle();
    query.addEventListener("change", settle);
    window.addEventListener("resize", settle);
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => motion.measure())
        : null;
    observer?.observe(element);
    return () => {
      query.removeEventListener("change", settle);
      window.removeEventListener("resize", settle);
      observer?.disconnect();
      motion.dispose();
      controller.current = null;
    };
  }, [ref]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const configured = Number.parseFloat(
      getComputedStyle(element).getPropertyValue("--motion-duration"),
    );
    const duration = Number.isFinite(configured)
      ? Math.min(420, Math.max(0, configured * 3))
      : 360;
    controller.current?.update(
      scopeKey,
      preference.current?.matches ?? true,
      duration,
    );
    // The key explicitly declares the presentation transitions that may move.
    void layoutKey;
  }, [ref, layoutKey, scopeKey]);
}
