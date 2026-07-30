const runtimeMutationLocks = new WeakMap<object, Promise<void>>();

/** Serializes persisted linked-account mutations, never model turns. */
export async function withLinkedProviderMutationLock<T>(
  runtime: object,
  task: () => Promise<T> | T,
): Promise<T> {
  const previous = runtimeMutationLocks.get(runtime) ?? Promise.resolve();
  let release!: () => void;
  const completion = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => completion);
  runtimeMutationLocks.set(runtime, next);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (runtimeMutationLocks.get(runtime) === next) {
      runtimeMutationLocks.delete(runtime);
    }
  }
}
