import type { SessionSummary } from "../shared/contracts";
import type { ProjectScope } from "./project-manager/models";
import { compactSessionPreview } from "./session-preview";

export type View =
  | "dashboard"
  | "chat"
  | "code"
  | "browser"
  | "gateway"
  | "review"
  | "orchestration"
  | "sessions"
  | "activity"
  | "analytics"
  | "media"
  | "models"
  | "connections"
  | "tools"
  | "skills"
  | "plugins"
  | "memory"
  | "automations"
  | "profiles"
  | "logs"
  | "keys"
  | "settings"
  | "docs"
  | "runtime"
  | "compatibility"
  | "registry"
  | "operatorSetup";

export const views = new Set<View>([
  "dashboard",
  "chat",
  "code",
  "browser",
  "gateway",
  "review",
  "orchestration",
  "sessions",
  "activity",
  "analytics",
  "media",
  "models",
  "connections",
  "tools",
  "skills",
  "plugins",
  "memory",
  "automations",
  "profiles",
  "logs",
  "keys",
  "settings",
  "docs",
  "runtime",
  "compatibility",
  "registry",
  "operatorSetup",
]);

export type NavigationSectionId =
  | "workspace"
  | "create"
  | "observe"
  | "agent"
  | "manage";

export interface NavigationItem {
  id: View;
  label: string;
}

export interface NavigationSection {
  id: NavigationSectionId;
  label: string;
  items: NavigationItem[];
}

export const navigation: NavigationSection[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { id: "dashboard", label: "Home" },
      { id: "chat", label: "Chat" },
      { id: "code", label: "Code" },
      { id: "browser", label: "Browser & preview" },
      { id: "orchestration", label: "Work" },
    ],
  },
  {
    id: "create",
    label: "Create",
    items: [
      { id: "media", label: "Media studio" },
      { id: "automations", label: "Automations" },
    ],
  },
  {
    id: "observe",
    label: "Observe",
    items: [
      { id: "sessions", label: "Sessions" },
      { id: "gateway", label: "Gateway inbox" },
      { id: "activity", label: "Activity" },
      { id: "analytics", label: "Analytics" },
    ],
  },
  {
    id: "agent",
    label: "Agent",
    items: [
      { id: "models", label: "Models" },
      { id: "connections", label: "Providers & accounts" },
      { id: "tools", label: "Tools" },
      { id: "skills", label: "Skills" },
      { id: "plugins", label: "Plugins" },
      { id: "memory", label: "Memory" },
      { id: "profiles", label: "Profiles" },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      { id: "logs", label: "Logs" },
      { id: "settings", label: "Settings" },
      { id: "keys", label: "Keys" },
      { id: "runtime", label: "Runtime" },
      { id: "compatibility", label: "Compatibility" },
      { id: "registry", label: "Registry" },
      { id: "operatorSetup", label: "Setup" },
      { id: "docs", label: "About" },
    ],
  },
];

export const VIEW_DESCRIPTIONS: Record<View, string> = {
  dashboard: "See runtime health, active work, and next operator actions",
  chat: "Start or continue a conversation",
  code: "Inspect files, changes, commits, worktrees, and terminal history",
  browser: "Preview localhost apps and capture browser evidence",
  gateway: "Inspect recorded gateway messages and replay an inbound record",
  review: "Approve decisions and inspect workspace changes and agent outputs",
  orchestration:
    "Start, supervise, inspect, and approve tasks, agents, plans, and runs",
  sessions: "Search and inspect conversation history",
  activity: "Review deliveries, commands, and runtime events",
  analytics: "Understand local usage and activity",
  media: "Analyze, transcribe, speak, and generate",
  models: "Choose models and inference providers",
  connections: "Sign in and connect provider accounts",
  tools: "Inspect callable tools",
  skills: "Browse installed agent skills",
  plugins: "Inspect the ElizaOS plugin runtime",
  memory: "Review local agent and user memory",
  automations: "Schedule recurring agent work",
  profiles: "Shape identity and personality",
  logs: "Trace runtime behavior",
  keys: "Manage local provider credentials",
  settings: "Configure Doolittle",
  docs: "Learn how the desktop works",
  runtime: "Inspect local runtime health",
  compatibility: "Verify SDK compatibility",
  registry: "Explore the capability registry",
  operatorSetup: "Complete local setup",
};

export const DEFAULT_OPEN_SECTIONS: NavigationSectionId[] = [
  "workspace",
  "create",
];
export const NAV_SECTIONS_KEY = "doolittle.desktop.nav-sections.v1";
export const NAV_COLLAPSED_KEY = "doolittle.desktop.nav-collapsed.v1";
export const MOBILE_SIDEBAR_QUERY = "(max-width: 940px)";
export const PROJECT_SCOPE_KEY = "doolittle.desktop.project-scope.v1";
export const PROJECT_SWITCH_DEBOUNCE_MS = 120;

export const PRIMARY_NAV_ITEMS: Array<{
  id: "chat" | "code" | "orchestration";
  label: string;
  description: string;
}> = [
  { id: "chat", label: "Chat", description: "Conversations" },
  { id: "code", label: "Code", description: "Workspace" },
  {
    id: "orchestration",
    label: "Work",
    description: "Agent work and review",
  },
];

export function loadOpenSections(
  storage: Pick<Storage, "getItem"> = localStorage,
): Set<NavigationSectionId> {
  try {
    const parsed = JSON.parse(
      storage.getItem(NAV_SECTIONS_KEY) ?? "null",
    ) as unknown;
    if (!Array.isArray(parsed)) return new Set(DEFAULT_OPEN_SECTIONS);
    const valid = parsed.filter(
      (id): id is NavigationSectionId =>
        typeof id === "string" &&
        navigation.some((section) => section.id === id),
    );
    return new Set(valid.length ? valid : DEFAULT_OPEN_SECTIONS);
  } catch {
    return new Set(DEFAULT_OPEN_SECTIONS);
  }
}

export function loadProjectScope(
  storage: Pick<Storage, "getItem"> = localStorage,
): ProjectScope {
  const stored = storage.getItem(PROJECT_SCOPE_KEY)?.trim();
  return stored || "all";
}

export function viewFromHash(hash = window.location.hash): View {
  const value = hash.replace(/^#\/?/u, "") as View;
  return views.has(value) ? value : "chat";
}

export function workspaceName(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? "Local workspace";
}

export function collectSidebarFocusables(
  scope: HTMLElement | null,
): HTMLElement[] {
  if (!scope) return [];
  return Array.from(
    scope.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]',
    ),
  ).filter((element) => {
    if (
      element.hasAttribute("hidden") ||
      element.getAttribute("disabled") !== null
    ) {
      return false;
    }
    return element.tabIndex !== -1;
  });
}

export function sessionLabel(session: SessionSummary): string {
  return (
    compactSessionPreview(session.title ?? "") ||
    compactSessionPreview(session.preview[0] ?? "") ||
    "Conversation"
  );
}
