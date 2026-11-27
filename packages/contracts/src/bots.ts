/** Stable product ownership. Display names must never be used as runtime IDs. */

export type { BotCharacterSheet } from "./bot-character";

import type { BotCharacterSheet } from "./bot-character";
export interface BotTarget {
  botId: string;
  sessionId?: string;
  projectId?: string;
}

export interface BotModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

/** Named workers currently support only these host-scoped account bridges. */
export const BOT_MODEL_PROVIDERS = [
  "offline",
  "openai",
  "anthropic",
  "codex",
  "claude-code",
] as const;
export function isBotModelProvider(provider: string): boolean {
  return (BOT_MODEL_PROVIDERS as readonly string[]).includes(provider);
}

/** References only: no credentials, environment variables, or provider tokens. */
export interface BotPermissions {
  connectionIds: string[];
  workspacePaths: string[];
  toolIds: string[];
  allowMutation: boolean;
  allowDelegation: boolean;
}

export interface BotPermissionsValidationOptions {
  /** Inclusive maximum length of each reference list. */
  maxEntries?: number;
  /** Inclusive maximum length of each reference. */
  maxValueLength?: number;
  /** Whether blank references are accepted in persisted legacy snapshots. */
  allowBlankEntries?: boolean;
}

/** Structural validation shared by host and worker boundaries. */
export function isBotPermissions(
  value: unknown,
  options: BotPermissionsValidationOptions = {},
): value is BotPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const permissions = value as Partial<BotPermissions>;
  const maxEntries = options.maxEntries ?? Number.POSITIVE_INFINITY;
  const maxValueLength = options.maxValueLength ?? Number.POSITIVE_INFINITY;
  return (
    [
      permissions.connectionIds,
      permissions.workspacePaths,
      permissions.toolIds,
    ].every(
      (entries) =>
        Array.isArray(entries) &&
        entries.length <= maxEntries &&
        entries.every(
          (entry) =>
            typeof entry === "string" &&
            entry.length <= maxValueLength &&
            (options.allowBlankEntries === true || entry.trim().length > 0),
        ),
    ) &&
    typeof permissions.allowMutation === "boolean" &&
    typeof permissions.allowDelegation === "boolean"
  );
}

export type BotLifecycleState =
  | "stopped"
  | "starting"
  | "ready"
  | "busy"
  | "waiting"
  | "error"
  | "archived";

export interface BotDefinition {
  id: string;
  agentId: string;
  name: string;
  persona: string;
  /** Canonical, bounded ElizaOS personality fields. Legacy bots may omit it. */
  character?: BotCharacterSheet;
  /** A local avatar key, not an arbitrary remote or filesystem URL. */
  avatar?: string;
  model: BotModelRoute;
  permissions: BotPermissions;
  workspacePath: string;
  projectId?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface BotSummary extends BotDefinition {
  state: BotLifecycleState;
  activeRunCount: number;
  /** Redacted, user-actionable diagnosis; never raw child stderr. */
  error?: string;
}

export interface BotCatalogResponse {
  version: 1;
  defaultBotId: string;
  bots: BotSummary[];
}

export interface CreateBotInput {
  name: string;
  persona?: string;
  character?: BotCharacterSheet;
  avatar?: string;
  model?: BotModelRoute;
  permissions?: Partial<BotPermissions>;
  workspacePath?: string;
  projectId?: string;
}

export type UpdateBotInput = Partial<CreateBotInput>;

/** Host-owned, explicitly selected membership; never derived from projects. */
export interface BotTeam {
  id: string;
  name: string;
  memberBotIds: string[];
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface BotTeamCatalogResponse {
  version: 1;
  revision: number;
  teams: BotTeam[];
}

export interface CreateBotTeamInput {
  name: string;
  memberBotIds: string[];
  expectedRevision: number;
}

export interface UpdateBotTeamInput {
  name?: string;
  memberBotIds?: string[];
  expectedRevision: number;
}

export interface BotRunOwner {
  botId: string;
  agentId: string;
  sessionId: string;
  runId: string;
  projectId?: string;
}

/** Task-scoped communication, deliberately not a shared private-memory bus. */
export interface BotConsultationRequest {
  dispatchId: string;
  origin: BotRunOwner;
  targetBotId: string;
  rootRunId: string;
  parentDispatchId?: string;
  ancestry: string[];
  depth: number;
  objective: string;
  context: Array<{ text: string; source: string }>;
  knowledgeIds: string[];
  permissions: BotPermissions;
  deadline: string;
}

export interface BotConsultationResult {
  dispatchId: string;
  owner: BotRunOwner;
  outcome: "complete" | "cancelled" | "error" | "timeout";
  text: string;
  evidence: Array<{ id: string; title: string; source: string }>;
}

export interface SharedKnowledgeRecord {
  id: string;
  version: number;
  documentId: string;
  scope: { kind: "project" | "team"; id: string };
  source: BotRunOwner & { messageId?: string; links: string[] };
  title: string;
  promotedBy: string;
  createdAt: string;
  updatedAt: string;
  revokedAt?: string;
  /** Computed host integrity diagnosis; original saved provenance is retained. */
  integrity?: { status: "ambiguous-document"; message: string };
}

/** Grant metadata only; document content remains in the broker-owned worker. */
export interface KnowledgeGrant {
  knowledgeId: string;
  botId: string;
  grantedAt: string;
  revokedAt?: string;
}

export interface SharedKnowledgeResponse {
  knowledge: SharedKnowledgeRecord[];
  grants: KnowledgeGrant[];
}
