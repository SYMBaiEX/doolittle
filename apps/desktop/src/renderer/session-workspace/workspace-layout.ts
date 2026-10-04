export const SESSION_WORKSPACE_STORAGE_KEY =
  "doolittle.desktop.session-workspace.v1";
export const MAX_OPEN_PANELS = 12;
export const MAX_RETAINED_CLOSED_PANELS = 12;

/** Keep open views alive and only the most recently used closed React trees. */
export function retainWorkspacePanels(
  retainedIds: readonly string[],
  openIds: readonly string[],
): string[] {
  const open = new Set(openIds);
  const closed = [...new Set(retainedIds)].filter((id) => !open.has(id));
  return [...closed.slice(-MAX_RETAINED_CLOSED_PANELS), ...open];
}

export interface SessionWorkspaceLayout {
  version: 1;
  openIds: string[];
  focusedId: string;
  weights: Record<string, number>;
  mode: "tiles" | "focus";
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/u.test(value);

export function restoreWorkspaceLayout(
  value: string | null,
  selectedId: string,
): SessionWorkspaceLayout {
  const fallback: SessionWorkspaceLayout = {
    version: 1,
    openIds: validId(selectedId) ? [selectedId] : [],
    focusedId: selectedId,
    weights: {},
    mode: "tiles",
  };
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (parsed?.version !== 1 || !Array.isArray(parsed.openIds))
      return fallback;
    const openIds: string[] = [
      ...new Set<string>(parsed.openIds.filter(validId)),
    ].slice(0, MAX_OPEN_PANELS);
    if (validId(selectedId) && !openIds.includes(selectedId)) {
      if (openIds.length >= MAX_OPEN_PANELS) openIds.pop();
      openIds.push(selectedId);
    }
    const weights = Object.fromEntries(
      openIds.map((id) => [
        id,
        typeof parsed.weights?.[id] === "number" &&
        Number.isFinite(parsed.weights[id])
          ? Math.min(4, Math.max(0.5, parsed.weights[id]))
          : 1,
      ]),
    );
    return {
      version: 1,
      openIds,
      focusedId: openIds.includes(selectedId)
        ? selectedId
        : openIds.includes(parsed.focusedId)
          ? parsed.focusedId
          : (openIds[0] ?? ""),
      weights,
      mode: parsed.mode === "focus" ? "focus" : "tiles",
    };
  } catch {
    return fallback;
  }
}

export function openWorkspaceSession(
  layout: SessionWorkspaceLayout,
  id: string,
): SessionWorkspaceLayout {
  if (!validId(id)) return layout;
  const alreadyOpen = layout.openIds.includes(id);
  if (!alreadyOpen && layout.openIds.length >= MAX_OPEN_PANELS) return layout;
  return {
    ...layout,
    openIds: alreadyOpen ? layout.openIds : [...layout.openIds, id],
    focusedId: id,
  };
}

export function closeWorkspaceSession(
  layout: SessionWorkspaceLayout,
  id: string,
): SessionWorkspaceLayout {
  const index = layout.openIds.indexOf(id);
  const openIds = layout.openIds.filter((value) => value !== id);
  return {
    ...layout,
    openIds,
    focusedId:
      layout.focusedId === id
        ? (openIds[Math.min(index, openIds.length - 1)] ?? "")
        : layout.focusedId,
  };
}

export function moveWorkspaceSession(
  layout: SessionWorkspaceLayout,
  id: string,
  direction: -1 | 1,
): SessionWorkspaceLayout {
  const index = layout.openIds.indexOf(id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= layout.openIds.length) return layout;
  const openIds = [...layout.openIds];
  [openIds[index], openIds[next]] = [
    openIds[next] as string,
    openIds[index] as string,
  ];
  return { ...layout, openIds };
}

/** Adjacent weights change together so a drag does not shift unrelated panels. */
export function resizeWorkspacePair(
  layout: SessionWorkspaceLayout,
  left: string,
  right: string,
  delta: number,
): SessionWorkspaceLayout {
  if (
    !Number.isFinite(delta) ||
    !layout.openIds.includes(left) ||
    !layout.openIds.includes(right)
  )
    return layout;
  const leftWeight = layout.weights[left] ?? 1;
  const rightWeight = layout.weights[right] ?? 1;
  const change = Math.min(
    4 - leftWeight,
    rightWeight - 0.5,
    Math.max(0.5 - leftWeight, rightWeight - 4, delta),
  );
  return {
    ...layout,
    weights: {
      ...layout.weights,
      [left]: leftWeight + change,
      [right]: rightWeight - change,
    },
  };
}
