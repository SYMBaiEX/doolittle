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

export type DesktopDestination = "home" | "chat" | "code" | "work" | "settings";

export type DesktopSection =
  | "activity"
  | "insights"
  | "history"
  | "media"
  | "preview"
  | "review"
  | "automations"
  | "inbox"
  | "models"
  | "accounts"
  | "credentials"
  | "tools"
  | "skills"
  | "plugins"
  | "memory"
  | "profiles"
  | "logs"
  | "runtime"
  | "compatibility"
  | "registry"
  | "setup"
  | "about";

export interface DesktopLocation {
  destination: DesktopDestination;
  section?: DesktopSection;
}

interface DesktopRouteLocation extends DesktopLocation {
  primaryView: "dashboard" | "chat" | "code" | "orchestration" | "settings";
}

/**
 * Compatibility boundary between the former page-per-capability model and the
 * destination-first desktop. Internal feature pages remain lazy while links,
 * history, and navigation expose only five stable destinations.
 */
export const DESKTOP_ROUTE_LOCATIONS: Readonly<
  Record<View, DesktopRouteLocation>
> = {
  dashboard: { destination: "home", primaryView: "dashboard" },
  activity: {
    destination: "home",
    section: "activity",
    primaryView: "dashboard",
  },
  analytics: {
    destination: "home",
    section: "insights",
    primaryView: "dashboard",
  },
  chat: { destination: "chat", primaryView: "chat" },
  sessions: {
    destination: "chat",
    section: "history",
    primaryView: "chat",
  },
  media: { destination: "chat", section: "media", primaryView: "chat" },
  code: { destination: "code", primaryView: "code" },
  browser: {
    destination: "code",
    section: "preview",
    primaryView: "code",
  },
  orchestration: { destination: "work", primaryView: "orchestration" },
  review: {
    destination: "work",
    section: "review",
    primaryView: "orchestration",
  },
  automations: {
    destination: "work",
    section: "automations",
    primaryView: "orchestration",
  },
  gateway: {
    destination: "work",
    section: "inbox",
    primaryView: "orchestration",
  },
  settings: { destination: "settings", primaryView: "settings" },
  models: {
    destination: "settings",
    section: "models",
    primaryView: "settings",
  },
  connections: {
    destination: "settings",
    section: "accounts",
    primaryView: "settings",
  },
  keys: {
    destination: "settings",
    section: "credentials",
    primaryView: "settings",
  },
  tools: {
    destination: "settings",
    section: "tools",
    primaryView: "settings",
  },
  skills: {
    destination: "settings",
    section: "skills",
    primaryView: "settings",
  },
  plugins: {
    destination: "settings",
    section: "plugins",
    primaryView: "settings",
  },
  memory: {
    destination: "settings",
    section: "memory",
    primaryView: "settings",
  },
  profiles: {
    destination: "settings",
    section: "profiles",
    primaryView: "settings",
  },
  logs: {
    destination: "settings",
    section: "logs",
    primaryView: "settings",
  },
  runtime: {
    destination: "settings",
    section: "runtime",
    primaryView: "settings",
  },
  compatibility: {
    destination: "settings",
    section: "compatibility",
    primaryView: "settings",
  },
  registry: {
    destination: "settings",
    section: "registry",
    primaryView: "settings",
  },
  operatorSetup: {
    destination: "settings",
    section: "setup",
    primaryView: "settings",
  },
  docs: {
    destination: "settings",
    section: "about",
    primaryView: "settings",
  },
};

const CANONICAL_VIEW_BY_PATH = new Map<string, View>(
  Object.entries(DESKTOP_ROUTE_LOCATIONS).map(([view, location]) => [
    desktopLocationPath(location),
    view as View,
  ]),
);

export interface ResolvedDesktopHash {
  location: DesktopLocation;
  view: View;
  canonicalHash: string;
  legacy: boolean;
}

export function desktopLocationPath(location: DesktopLocation): string {
  return `/${location.destination}${location.section ? `/${location.section}` : ""}`;
}

export function desktopHashForView(view: View): string {
  return `#${desktopLocationPath(DESKTOP_ROUTE_LOCATIONS[view])}`;
}

export function primaryViewForView(
  view: View,
): DesktopRouteLocation["primaryView"] {
  return DESKTOP_ROUTE_LOCATIONS[view].primaryView;
}

/**
 * Return the lazy route that owns a location. Home keeps its two observability
 * pages as independent section owners; Chat, Code, Work, and Settings keep one
 * mounted owner while their contextual section changes.
 */
export function renderedViewForView(view: View): View {
  const primary = primaryViewForView(view);
  if (primary === "dashboard" && view !== "dashboard") return view;
  return primary;
}

export function resolveDesktopHash(
  hash = window.location.hash,
): ResolvedDesktopHash {
  const rawPath = hash.replace(/^#?/u, "").replace(/\/+$/u, "") || "/chat";
  const canonicalView = CANONICAL_VIEW_BY_PATH.get(rawPath);
  const legacyCandidate = rawPath.replace(/^\//u, "") as View;
  const view =
    canonicalView ?? (views.has(legacyCandidate) ? legacyCandidate : "chat");
  const location = DESKTOP_ROUTE_LOCATIONS[view];
  const canonicalHash = desktopHashForView(view);
  return {
    location: { destination: location.destination, section: location.section },
    view,
    canonicalHash,
    legacy: canonicalView === undefined && rawPath !== "/chat",
  };
}

export type NavigationSectionId =
  | "home"
  | "chat"
  | "code"
  | "work"
  | "settings";

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
    id: "home",
    label: "Home",
    items: [
      { id: "dashboard", label: "Home" },
      { id: "activity", label: "Activity" },
      { id: "analytics", label: "Insights" },
    ],
  },
  {
    id: "chat",
    label: "Chat",
    items: [
      { id: "chat", label: "Conversation" },
      { id: "sessions", label: "History" },
      { id: "media", label: "Media" },
    ],
  },
  {
    id: "code",
    label: "Code",
    items: [
      { id: "code", label: "Workspace" },
      { id: "browser", label: "Preview & evidence" },
    ],
  },
  {
    id: "work",
    label: "Tasks",
    items: [
      { id: "orchestration", label: "Tasks" },
      { id: "review", label: "Review" },
      { id: "automations", label: "Automations" },
      { id: "gateway", label: "Inbox" },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      { id: "settings", label: "Settings" },
      { id: "models", label: "Models" },
      { id: "connections", label: "Providers & accounts" },
      { id: "keys", label: "Credentials" },
      { id: "tools", label: "Tools" },
      { id: "skills", label: "Skills" },
      { id: "plugins", label: "Plugins" },
      { id: "memory", label: "Memory" },
      { id: "profiles", label: "Profiles" },
      { id: "registry", label: "Registry" },
      { id: "runtime", label: "Runtime" },
      { id: "logs", label: "Logs" },
      { id: "compatibility", label: "Compatibility" },
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
    label: "Tasks",
    description: "Runs, agents, and review",
  },
];

export function loadProjectScope(
  storage: Pick<Storage, "getItem"> = localStorage,
): ProjectScope {
  const stored = storage.getItem(PROJECT_SCOPE_KEY)?.trim();
  return stored || "all";
}

export function viewFromHash(hash = window.location.hash): View {
  return resolveDesktopHash(hash).view;
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
