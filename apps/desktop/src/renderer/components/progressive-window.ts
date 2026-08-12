export interface ProgressiveWindow<T> {
  limit: number;
  remaining: number;
  visible: readonly T[];
}

export function progressiveWindow<T>(
  entries: readonly T[],
  options: {
    pageSize: number;
    requested: number;
    selectedIndex?: number;
  },
): ProgressiveWindow<T> {
  const pageSize = Number.isFinite(options.pageSize)
    ? Math.max(1, Math.floor(options.pageSize))
    : 1;
  const requested = Number.isFinite(options.requested)
    ? Math.max(pageSize, Math.floor(options.requested))
    : pageSize;
  const selectedLimit = Math.max(0, (options.selectedIndex ?? -1) + 1);
  const limit = Math.min(entries.length, Math.max(requested, selectedLimit));
  const visible = entries.slice(0, limit);

  return {
    limit,
    remaining: Math.max(0, entries.length - visible.length),
    visible,
  };
}
