/** Link an HTTP request or SSE consumer cancellation to turn execution. */
export function followAbortSignal(
  source: AbortSignal,
  target: AbortController,
): () => void {
  const abort = () => {
    if (!target.signal.aborted) {
      target.abort(source.reason);
    }
  };
  if (source.aborted) {
    abort();
    return () => undefined;
  }
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}
