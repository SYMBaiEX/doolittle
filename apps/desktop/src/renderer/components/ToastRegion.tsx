import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type ToastTone = "info" | "success" | "warning" | "error";

export interface ToastInput {
  id?: string;
  tone?: ToastTone;
  title?: ReactNode;
  message?: ReactNode;
  timeoutMs?: number;
}

export interface Toast {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title?: ReactNode;
  readonly message?: ReactNode;
}

export interface UseToastsOptions {
  maxVisible?: number;
  defaultTimeoutMs?: number;
}

export interface UseToastsResult {
  readonly toasts: readonly Toast[];
  readonly push: (toast: ToastInput) => string;
  readonly dismiss: (id: string) => void;
  readonly clear: () => void;
}

interface ManagedToast {
  id: string;
  tone: ToastTone;
  title?: ReactNode;
  message?: ReactNode;
  timeoutMs: number;
  isPaused: boolean;
  startedAt: number;
  remainingMs: number;
}

interface ToastState {
  visible: readonly ManagedToast[];
  queued: readonly ManagedToast[];
}

interface UseToastActions {
  pause: (id: string) => void;
  resume: (id: string) => void;
  clearQueue: () => void;
}

function createManagedToast(
  toast: ToastInput,
  now: number,
  timeoutMs: number,
): ManagedToast {
  return {
    id: toast.id ?? "",
    tone: toast.tone ?? "info",
    title: toast.title,
    message: toast.message,
    timeoutMs,
    isPaused: false,
    startedAt: now,
    remainingMs: timeoutMs,
  };
}

export function useToasts({
  maxVisible = 4,
  defaultTimeoutMs = 6000,
}: UseToastsOptions = {}): UseToastsResult & UseToastActions {
  const safeMaxVisible = Math.max(1, Math.floor(maxVisible));
  const safeTimeoutMs = Math.max(0, defaultTimeoutMs);

  const nextId = useRef(0);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const [state, setState] = useState<ToastState>({ visible: [], queued: [] });

  const makeVisible = useCallback(
    (toast: ManagedToast, now: number): ManagedToast => ({
      ...toast,
      isPaused: false,
      startedAt: now,
      remainingMs: toast.timeoutMs,
    }),
    [],
  );

  const push = useCallback(
    (toast: ToastInput) => {
      const now = Date.now();
      const tone = toast.tone ?? "info";
      const timeoutMs =
        toast.timeoutMs === undefined
          ? safeTimeoutMs
          : Math.max(0, toast.timeoutMs);
      const id = toast.id?.trim()
        ? `${toast.id.trim()}-${nextId.current}`
        : `toast-${nextId.current}`;
      nextId.current += 1;

      setState((current) => {
        const created = createManagedToast(
          { ...toast, id, tone, timeoutMs },
          now,
          timeoutMs,
        );

        if (current.visible.length < safeMaxVisible) {
          return {
            visible: [...current.visible, makeVisible(created, now)],
            queued: current.queued,
          };
        }

        return {
          visible: current.visible,
          queued: [...current.queued, created],
        };
      });

      return id;
    },
    [makeVisible, safeMaxVisible, safeTimeoutMs],
  );

  const dismiss = useCallback(
    (id: string) => {
      setState((current) => {
        if (!current.visible.some((toast) => toast.id === id)) {
          return current;
        }

        const now = Date.now();
        const remainingVisible = current.visible.filter(
          (toast) => toast.id !== id,
        );

        if (
          remainingVisible.length >= safeMaxVisible ||
          current.queued.length === 0
        ) {
          return {
            visible: remainingVisible,
            queued: current.queued,
          };
        }

        const [next, ...rest] = current.queued;
        return {
          visible: [...remainingVisible, makeVisible(next, now)],
          queued: rest,
        };
      });
    },
    [makeVisible, safeMaxVisible],
  );

  const clear = useCallback(() => {
    setState({ visible: [], queued: [] });
  }, []);

  const pause = useCallback((id: string) => {
    const now = Date.now();

    setState((current) => {
      let changed = false;

      const visible = current.visible.map((toast) => {
        if (toast.id !== id || toast.isPaused || toast.timeoutMs <= 0) {
          return toast;
        }

        changed = true;
        return {
          ...toast,
          isPaused: true,
          remainingMs: Math.max(0, toast.remainingMs - (now - toast.startedAt)),
        };
      });

      if (!changed) return current;

      return {
        ...current,
        visible,
      };
    });
  }, []);

  const resume = useCallback((id: string) => {
    const now = Date.now();

    setState((current) => {
      let changed = false;

      const visible = current.visible.map((toast) => {
        if (toast.id !== id || !toast.isPaused) {
          return toast;
        }

        changed = true;
        return {
          ...toast,
          isPaused: false,
          startedAt: now,
        };
      });

      if (!changed) return current;

      return {
        ...current,
        visible,
      };
    });
  }, []);

  useEffect(() => {
    timersRef.current.forEach((timer) => {
      clearTimeout(timer);
    });
    timersRef.current.clear();

    for (const toast of state.visible) {
      if (toast.timeoutMs <= 0 || toast.isPaused) {
        continue;
      }

      const timer = setTimeout(() => {
        dismiss(toast.id);
      }, toast.remainingMs);
      timersRef.current.set(toast.id, timer);
    }

    return () => {
      timersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      timersRef.current.clear();
    };
  }, [dismiss, state.visible]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => {
        clearTimeout(timer);
      });
      timersRef.current.clear();
    };
  }, []);

  const toasts = useMemo(
    () =>
      state.visible.map((toast) => ({
        id: toast.id,
        tone: toast.tone,
        title: toast.title,
        message: toast.message,
      })),
    [state.visible],
  );

  return { toasts, push, dismiss, clear, pause, resume, clearQueue: clear };
}
