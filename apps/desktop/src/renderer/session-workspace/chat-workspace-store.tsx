import {
  createContext,
  type Dispatch,
  type ReactNode,
  type RefObject,
  type SetStateAction,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

/** One volatile renderer store. Existing conversation persistence remains canonical. */
export class ChatWorkspaceStore {
  private values = new Map<string, unknown>();
  private references = new Map<string, RefObject<unknown>>();
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  read<T>(key: string, initial: T | (() => T)): T {
    if (!this.values.has(key)) {
      this.values.set(
        key,
        typeof initial === "function" ? (initial as () => T)() : initial,
      );
    }
    return this.values.get(key) as T;
  }

  update<T>(key: string, next: SetStateAction<T>): void {
    const previous = this.values.get(key) as T;
    const value =
      typeof next === "function" ? (next as (value: T) => T)(previous) : next;
    if (Object.is(previous, value)) return;
    this.values.set(key, value);
    for (const listener of this.listeners) listener();
  }

  reference<T>(key: string, initial: T): RefObject<T> {
    if (!this.references.has(key))
      this.references.set(key, { current: initial });
    return this.references.get(key) as RefObject<T>;
  }
}

const ChatWorkspaceContext = createContext<ChatWorkspaceStore | null>(null);
const noSubscribe = () => () => undefined;

export function ChatWorkspaceProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new ChatWorkspaceStore());
  return (
    <ChatWorkspaceContext.Provider value={store}>
      {children}
    </ChatWorkspaceContext.Provider>
  );
}

/** Standalone ChatPage/hook consumers keep their established local behavior. */
export function useWorkspaceState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const store = useContext(ChatWorkspaceContext);
  const [local, setLocal] = useState<T>(() =>
    store
      ? store.read(key, initial)
      : typeof initial === "function"
        ? (initial as () => T)()
        : initial,
  );
  const value = useSyncExternalStore(store?.subscribe ?? noSubscribe, () =>
    store ? store.read(key, initial) : local,
  );
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      if (store) store.update(key, next);
      else setLocal(next);
    },
    [key, store],
  );
  return [value, update];
}

export function useWorkspaceRef<T>(key: string, initial: T): RefObject<T> {
  const store = useContext(ChatWorkspaceContext);
  const local = useRef(initial);
  return store ? store.reference(key, initial) : local;
}
