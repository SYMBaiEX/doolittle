/** Stable product ownership. Display names must never be used as runtime IDs. */
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

/** References only: no credentials, environment variables, or provider tokens. */
export interface BotPermissions {
  connectionIds: string[];
  workspacePaths: string[];
  toolIds: string[];
  allowMutation: boolean;
  allowDelegation: boolean;
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
  persona: string;
  avatar?: string;
  model?: BotModelRoute;
  permissions?: Partial<BotPermissions>;
  workspacePath?: string;
  projectId?: string;
}

export type UpdateBotInput = Partial<CreateBotInput>;

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
