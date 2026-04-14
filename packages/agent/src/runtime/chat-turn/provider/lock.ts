import type { AgentExecutionContext } from "@/runtime/chat";

const providerRuntimeLocks = new WeakMap<object, Promise<void>>();

export async function withProviderRuntimeLock<T>(
  runtime: AgentExecutionContext["runtime"],
  task: () => Promise<T>,
): Promise<T> {
  const previous = providerRuntimeLocks.get(runtime) ?? Promise.resolve();
  let release!: () => void;
  const completion = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => completion);
  providerRuntimeLocks.set(runtime, next);
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release();
    if (providerRuntimeLocks.get(runtime) === next) {
      providerRuntimeLocks.delete(runtime);
    }
  }
}
