interface DesktopQuitOptions {
  stopOwnedRuntimes(): ReadonlyArray<() => Promise<unknown>>;
  holdRuntimeStarts?(): () => void;
  afterStopped(): Promise<void>;
  setQuitting(quitting: boolean): void;
  quit(): void;
  onFailure(): void;
}

/** Keep the parent alive until every owned runtime has confirmed its exit. */
export function createDesktopQuitHandler(options: DesktopQuitOptions) {
  let allowQuit = false;
  let pending: Promise<void> | undefined;
  return (event: Pick<Electron.Event, "preventDefault">): Promise<void> => {
    if (allowQuit) return Promise.resolve();
    event.preventDefault();
    if (pending) return pending;
    const releaseRuntimeStarts = options.holdRuntimeStarts?.();
    options.setQuitting(true);
    pending = Promise.resolve()
      .then(() =>
        Promise.allSettled(
          options
            .stopOwnedRuntimes()
            .map((stop) => Promise.resolve().then(stop)),
        ),
      )
      .then(async (results) => {
        if (results.some((result) => result.status === "rejected")) {
          throw new Error("Owned runtime shutdown was not confirmed.");
        }
        await options.afterStopped();
        allowQuit = true;
        options.quit();
      })
      .catch(() => {
        releaseRuntimeStarts?.();
        options.setQuitting(false);
        options.onFailure();
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
