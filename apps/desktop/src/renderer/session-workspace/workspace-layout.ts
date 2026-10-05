export const SESSION_WORKSPACE_STORAGE_KEY =
  "doolittle.desktop.session-workspace.v2";
export const LEGACY_SESSION_WORKSPACE_STORAGE_KEY =
  "doolittle.desktop.session-workspace.v1";
export const MAX_OPEN_PANELS = 12;
export const MAX_RETAINED_CLOSED_PANELS = 12;

export type SplitAxis = "horizontal" | "vertical";
export type WorkspaceNode =
  | { type: "leaf"; id: string }
  | {
      type: "split";
      axis: SplitAxis;
      ratio: number;
      first: WorkspaceNode;
      second: WorkspaceNode;
    };

export interface SessionWorkspaceLayout {
  version: 2;
  openIds: string[];
  focusedId: string;
  mode: "tabs" | "split";
  tree: WorkspaceNode | null;
}

export interface WorkspaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WorkspaceDivider {
  path: string;
  axis: SplitAxis;
  x: number;
  y: number;
  width: number;
  height: number;
  ratio: number;
}

const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9:_-]{1,128}$/u.test(value);
const leaf = (id: string): WorkspaceNode => ({ type: "leaf", id });
const clampRatio = (ratio: number) => Math.max(0.2, Math.min(0.8, ratio));

/** Closed views may be unmounted, but drafts and runs live outside these trees. */
export function retainWorkspacePanels(
  retainedIds: readonly string[],
  openIds: readonly string[],
): string[] {
  const open = new Set(openIds);
  const closed = [...new Set(retainedIds)].filter((id) => !open.has(id));
  return [...closed.slice(-MAX_RETAINED_CLOSED_PANELS), ...open];
}

function parseNode(
  value: unknown,
  allowed: Set<string>,
  seen: Set<string>,
  depth = 0,
): WorkspaceNode | null {
  if (!value || typeof value !== "object" || depth > MAX_OPEN_PANELS)
    return null;
  const node = value as Record<string, unknown>;
  if (
    node.type === "leaf" &&
    validId(node.id) &&
    allowed.has(node.id) &&
    !seen.has(node.id)
  ) {
    seen.add(node.id);
    return leaf(node.id);
  }
  if (
    node.type !== "split" ||
    (node.axis !== "horizontal" && node.axis !== "vertical")
  )
    return null;
  const first = parseNode(node.first, allowed, seen, depth + 1);
  const second = parseNode(node.second, allowed, seen, depth + 1);
  if (!first) return second;
  if (!second) return first;
  return {
    type: "split",
    axis: node.axis,
    ratio: clampRatio(Number(node.ratio) || 0.5),
    first,
    second,
  };
}

function appendNode(tree: WorkspaceNode | null, id: string): WorkspaceNode {
  return tree
    ? {
        type: "split",
        axis: "horizontal",
        ratio: 0.5,
        first: tree,
        second: leaf(id),
      }
    : leaf(id);
}

function completeTree(
  tree: WorkspaceNode | null,
  openIds: readonly string[],
): WorkspaceNode | null {
  const seen = new Set<string>();
  let complete = tree ? parseNode(tree, new Set(openIds), seen) : null;
  for (const id of openIds)
    if (!seen.has(id)) complete = appendNode(complete, id);
  return complete;
}

export function restoreWorkspaceLayout(
  value: string | null,
  selectedId: string,
): SessionWorkspaceLayout {
  const fallbackIds = validId(selectedId) ? [selectedId] : [];
  const fallback: SessionWorkspaceLayout = {
    version: 2,
    openIds: fallbackIds,
    focusedId: fallbackIds[0] ?? "",
    mode: "tabs",
    tree: fallbackIds[0] ? leaf(fallbackIds[0]) : null,
  };
  try {
    const parsed = value ? JSON.parse(value) : null;
    if (
      !parsed ||
      ![1, 2].includes(parsed.version) ||
      !Array.isArray(parsed.openIds)
    )
      return fallback;
    const openIds = [...new Set<string>(parsed.openIds.filter(validId))].slice(
      0,
      MAX_OPEN_PANELS,
    );
    if (validId(selectedId) && !openIds.includes(selectedId)) {
      if (openIds.length >= MAX_OPEN_PANELS) openIds.pop();
      openIds.push(selectedId);
    }
    let tree: WorkspaceNode | null = null;
    if (parsed.version === 2) {
      tree = completeTree(parsed.tree, openIds);
    } else {
      for (const id of openIds) tree = appendNode(tree, id);
    }
    return {
      version: 2,
      openIds,
      focusedId: openIds.includes(selectedId)
        ? selectedId
        : openIds.includes(parsed.focusedId)
          ? parsed.focusedId
          : (openIds[0] ?? ""),
      mode:
        parsed.version === 2
          ? parsed.mode === "split"
            ? "split"
            : "tabs"
          : parsed.mode === "tiles" && openIds.length > 1
            ? "split"
            : "tabs",
      tree,
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
  if (layout.openIds.includes(id)) return { ...layout, focusedId: id };
  if (layout.openIds.length >= MAX_OPEN_PANELS) return layout;
  return {
    ...layout,
    openIds: [...layout.openIds, id],
    focusedId: id,
    mode: "tabs",
    tree: appendNode(layout.tree, id),
  };
}

function removeNode(
  node: WorkspaceNode | null,
  id: string,
): WorkspaceNode | null {
  if (!node) return null;
  if (node.type === "leaf") return node.id === id ? null : node;
  const first = removeNode(node.first, id);
  const second = removeNode(node.second, id);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

export function closeWorkspaceSession(
  layout: SessionWorkspaceLayout,
  id: string,
): SessionWorkspaceLayout {
  const index = layout.openIds.indexOf(id);
  if (index < 0) return layout;
  const openIds = layout.openIds.filter((entry) => entry !== id);
  return {
    ...layout,
    openIds,
    tree: removeNode(layout.tree, id),
    focusedId:
      layout.focusedId === id
        ? (openIds[Math.min(index, openIds.length - 1)] ?? "")
        : layout.focusedId,
    mode: openIds.length < 2 ? "tabs" : layout.mode,
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

function replaceLeaf(
  node: WorkspaceNode,
  sourceId: string,
  targetId: string,
  axis: SplitAxis,
): WorkspaceNode {
  if (node.type === "leaf")
    return node.id === sourceId
      ? { type: "split", axis, ratio: 0.5, first: node, second: leaf(targetId) }
      : node;
  return {
    ...node,
    first: replaceLeaf(node.first, sourceId, targetId, axis),
    second: replaceLeaf(node.second, sourceId, targetId, axis),
  };
}

export function splitWorkspaceSession(
  layout: SessionWorkspaceLayout,
  sourceId: string,
  targetId: string,
  axis: SplitAxis,
): SessionWorkspaceLayout {
  if (
    sourceId === targetId ||
    !layout.openIds.includes(sourceId) ||
    !layout.openIds.includes(targetId) ||
    !layout.tree
  )
    return layout;
  const withoutTarget = removeNode(layout.tree, targetId);
  if (!withoutTarget) return layout;
  return {
    ...layout,
    mode: "split",
    focusedId: targetId,
    tree: replaceLeaf(withoutTarget, sourceId, targetId, axis),
  };
}

function mapNode(
  node: WorkspaceNode,
  path: string,
  target: string,
  transform: (node: Extract<WorkspaceNode, { type: "split" }>) => WorkspaceNode,
): WorkspaceNode {
  if (node.type === "leaf") return node;
  if (path === target) return transform(node);
  return {
    ...node,
    first: mapNode(node.first, `${path}0`, target, transform),
    second: mapNode(node.second, `${path}1`, target, transform),
  };
}

export function resizeWorkspaceSplit(
  layout: SessionWorkspaceLayout,
  path: string,
  ratio: number,
): SessionWorkspaceLayout {
  if (!layout.tree || !Number.isFinite(ratio)) return layout;
  return {
    ...layout,
    tree: mapNode(layout.tree, "", path, (node) => ({
      ...node,
      ratio: clampRatio(ratio),
    })),
  };
}

export function workspaceRequiredSize(node: WorkspaceNode | null): {
  width: number;
  height: number;
} {
  if (!node || node.type === "leaf") return { width: 360, height: 280 };
  const first = workspaceRequiredSize(node.first);
  const second = workspaceRequiredSize(node.second);
  const ratio = clampRatio(node.ratio);
  return node.axis === "horizontal"
    ? {
        // Each subtree must fit its actual saved share, not an assumed 50/50
        // split. Keep the arrangement saved while narrow windows use tabs.
        width: Math.ceil(
          Math.max(first.width / ratio, second.width / (1 - ratio)),
        ),
        height: Math.max(first.height, second.height),
      }
    : {
        width: Math.max(first.width, second.width),
        height: Math.ceil(
          Math.max(first.height / ratio, second.height / (1 - ratio)),
        ),
      };
}

export function workspaceGeometry(node: WorkspaceNode | null): {
  panels: Record<string, WorkspaceRect>;
  dividers: WorkspaceDivider[];
} {
  const panels: Record<string, WorkspaceRect> = {};
  const dividers: WorkspaceDivider[] = [];
  const visit = (current: WorkspaceNode, rect: WorkspaceRect, path: string) => {
    if (current.type === "leaf") {
      panels[current.id] = rect;
      return;
    }
    const ratio = clampRatio(current.ratio);
    if (current.axis === "horizontal") {
      const firstWidth = rect.width * ratio;
      visit(current.first, { ...rect, width: firstWidth }, `${path}0`);
      visit(
        current.second,
        { ...rect, x: rect.x + firstWidth, width: rect.width - firstWidth },
        `${path}1`,
      );
      dividers.push({
        path,
        axis: current.axis,
        x: rect.x + firstWidth,
        y: rect.y,
        width: 0,
        height: rect.height,
        ratio,
      });
    } else {
      const firstHeight = rect.height * ratio;
      visit(current.first, { ...rect, height: firstHeight }, `${path}0`);
      visit(
        current.second,
        {
          ...rect,
          y: rect.y + firstHeight,
          width: rect.width,
          height: rect.height - firstHeight,
        },
        `${path}1`,
      );
      dividers.push({
        path,
        axis: current.axis,
        x: rect.x,
        y: rect.y + firstHeight,
        width: rect.width,
        height: 0,
        ratio,
      });
    }
  };
  if (node) visit(node, { x: 0, y: 0, width: 100, height: 100 }, "");
  return { panels, dividers };
}
