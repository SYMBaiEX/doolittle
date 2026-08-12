import type { ThreadWorkbenchTab } from "../thread-workbench";
import type { useThreadWorkbenchRailController } from "../thread-workbench-controller";
import { compactWorkspacePath } from "../workspace-path";

export type ThreadWorkbenchFullView =
  | "code"
  | "review"
  | "orchestration"
  | "browser"
  | "settings"
  | "models"
  | "automations"
  | "runtime";

export type WorkbenchController = ReturnType<
  typeof useThreadWorkbenchRailController
>;

export interface NavigationCard {
  label: string;
  view: ThreadWorkbenchFullView;
  blurb: string;
}

export interface WorkbenchPanelMetrics {
  approvals: number;
  changes: number;
  commands: number;
  files: number;
  plans: number;
  preview: string;
  settings: number;
  tasks: number;
}

export const TAB_LABELS: Record<ThreadWorkbenchTab, string> = {
  files: "Files",
  changes: "Changes",
  terminal: "Terminal",
  plans: "Plans",
  brief: "Brief",
  settings: "Settings",
  preview: "Preview",
};

export const TAB_MARKS: Record<ThreadWorkbenchTab, string> = {
  files: "F",
  changes: "Δ",
  terminal: ">_",
  plans: "P",
  brief: "⚡",
  settings: "▦",
  preview: "◎",
};

export const FULL_VIEW: Partial<
  Record<ThreadWorkbenchTab, ThreadWorkbenchFullView>
> = {
  files: "code",
  changes: "review",
  terminal: "code",
  plans: "orchestration",
  settings: "settings",
  preview: "browser",
};

export function workbenchPanelMeta(
  tab: ThreadWorkbenchTab,
  metrics: WorkbenchPanelMetrics,
): string {
  switch (tab) {
    case "files":
      return `${metrics.files} entries`;
    case "changes":
      return `${metrics.changes} changed`;
    case "terminal":
      return `${metrics.commands} commands`;
    case "plans":
      return `${metrics.plans} plans`;
    case "brief":
      return `${metrics.approvals} approvals · ${metrics.tasks} tasks`;
    case "settings":
      return `${metrics.settings} values`;
    case "preview":
      return metrics.preview;
  }
}

export const QUICK_NAVIGATION: NavigationCard[] = [
  {
    label: "Workspace",
    view: "code",
    blurb: "Open the coding workspace.",
  },
  {
    label: "Reviews",
    view: "review",
    blurb: "Open the review panel for changes and diffs.",
  },
  {
    label: "Tasks",
    view: "orchestration",
    blurb: "Open orchestration and delegation status.",
  },
  {
    label: "Browser",
    view: "browser",
    blurb: "Open local preview and capture tools.",
  },
  {
    label: "Settings",
    view: "settings",
    blurb: "Go to runtime and model settings.",
  },
  {
    label: "Models",
    view: "models",
    blurb: "Adjust model providers and routing.",
  },
  {
    label: "Automations",
    view: "automations",
    blurb: "Open automations and schedules.",
  },
  {
    label: "Runtime",
    view: "runtime",
    blurb: "Inspect runtime health and diagnostics.",
  },
];

export function branchHeadLabel(branch: string, head: string): string {
  const compactHead = head ? head.slice(0, 8) : "";
  return [branch || "No branch", compactHead].filter(Boolean).join(" · ");
}

export function compactRailLabel(value: string): string {
  return compactWorkspacePath(value, 3);
}

export function statusTone(
  status: string,
): "neutral" | "good" | "warn" | "bad" {
  const normalized = status.toLowerCase();
  if (["completed", "ready", "success", "clean", "active"].includes(normalized))
    return "good";
  if (["failed", "error", "denied", "cancelled"].includes(normalized))
    return "bad";
  if (["running", "pending", "draft", "waiting", "dirty"].includes(normalized))
    return "warn";
  return "neutral";
}
