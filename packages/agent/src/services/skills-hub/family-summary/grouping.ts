export interface GroupedSummaryCounts {
  count: number;
  workspace: number;
  generated: number;
  catalog: number;
  installed: number;
}

export function makeGroupedSummaryCounts(): GroupedSummaryCounts {
  return {
    count: 0,
    workspace: 0,
    generated: 0,
    catalog: 0,
    installed: 0,
  };
}

export function incrementGroupedCount(
  groups: Map<string, GroupedSummaryCounts>,
  name: string,
  source: "workspace" | "generated" | "catalog" | "installed",
): void {
  if (!name) {
    return;
  }
  const current = groups.get(name) ?? makeGroupedSummaryCounts();
  current.count += 1;
  current[source] += 1;
  groups.set(name, current);
}

export function mapToSortedGroupedRecords(
  groups: Map<string, GroupedSummaryCounts>,
) {
  return [...groups.entries()]
    .map(([name, value]) => ({ name, ...value }))
    .sort(
      (left, right) =>
        right.count - left.count || left.name.localeCompare(right.name),
    );
}
