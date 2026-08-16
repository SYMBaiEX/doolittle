import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Owns one cancellable media request. A newer request, a user cancellation,
 * and unmounting all invalidate the prior request's completion.
 */
export function useAbortableMediaRequest(active = true) {
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    if (mountedRef.current) setBusy(false);
  }, []);

  const run = useCallback(
    async <T>(request: (signal: AbortSignal) => Promise<T>) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setBusy(true);

      try {
        const result = await request(controller.signal);
        if (
          controllerRef.current !== controller ||
          controller.signal.aborted ||
          !mountedRef.current
        ) {
          return undefined;
        }
        return result;
      } catch (error) {
        if (
          controllerRef.current !== controller ||
          controller.signal.aborted ||
          !mountedRef.current
        ) {
          return undefined;
        }
        throw error;
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          if (mountedRef.current) setBusy(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (!active) cancel();
  }, [active, cancel]);

  return { busy, cancel, run };
}
