/** A completed bind may change native ownership, but only the latest UI intent may open a panel. */
export function createTerminalOpenIntent() {
  let contextKey = "";
  let revision = 0;
  let pending: number | null = null;

  const cancel = () => {
    revision += 1;
    pending = null;
  };

  const setContext = (nextContextKey: string) => {
    if (contextKey === nextContextKey) return;
    contextKey = nextContextKey;
    cancel();
  };

  const claim = (intent: number, expectedContextKey: string) => {
    if (pending !== intent || contextKey !== expectedContextKey) return false;
    pending = null;
    return true;
  };

  return {
    cancel,
    setContext,
    isPending: () => pending !== null,
    async run(
      nextContextKey: string,
      bind: () => Promise<unknown>,
      open: () => void,
      onError: () => void,
    ): Promise<void> {
      setContext(nextContextKey);
      if (pending !== null) return;
      const intent = ++revision;
      pending = intent;
      try {
        await bind();
      } catch {
        if (claim(intent, nextContextKey)) onError();
        return;
      }
      if (claim(intent, nextContextKey)) open();
    },
  };
}
