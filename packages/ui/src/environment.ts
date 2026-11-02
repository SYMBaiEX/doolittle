import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useSyncExternalStore,
} from "react";

/** Desktop layout and motion preferences belong to the client shell. */
export function useMediaQuery(query: string): boolean {
  const media = useMemo(
    () =>
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia(query)
        : null,
    [query],
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      media?.addEventListener("change", listener);
      return () => media?.removeEventListener("change", listener);
    },
    [media],
  );
  const snapshot = useCallback(() => media?.matches ?? false, [media]);
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

function subscribeVisibility(listener: () => void) {
  if (typeof document === "undefined") return () => {};
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}
const visible = () =>
  typeof document === "undefined" || document.visibilityState !== "hidden";

/** Pause client status polling while hidden and always use the latest callback. */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled = true,
): void {
  const isVisible = useSyncExternalStore(
    subscribeVisibility,
    visible,
    () => true,
  );
  const tick = useEffectEvent(callback);
  useEffect(() => {
    if (
      !enabled ||
      !isVisible ||
      !Number.isFinite(intervalMs) ||
      intervalMs <= 0
    )
      return;
    const timer = setInterval(() => tick(), intervalMs);
    return () => clearInterval(timer);
  }, [enabled, intervalMs, isVisible]);
}
