export interface RuntimeStatus {
  provider: string;
  model: string;
  reasoningEffort?: RuntimeReasoningEffort;
  startup?: unknown;
  plugins: Record<string, boolean>;
  native?: { catalog?: unknown[]; grouped?: Record<string, unknown[]> };
  fallback?: { offlineBootstrapMode?: boolean };
  gateway?: unknown;
  ownership?: Record<string, unknown>;
}

export type RuntimeReasoningEffort =
  | "none"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";
export interface RuntimeModelReasoningOption {
  id: RuntimeReasoningEffort;
  label: string;
  description?: string;
}
export interface RuntimeModelReasoningCapability {
  default?: RuntimeReasoningEffort;
  options: RuntimeModelReasoningOption[];
}
export interface RuntimeModelOption {
  id: string;
  label: string;
  source: "configured" | "discovered";
  reasoning?: RuntimeModelReasoningCapability;
}
export interface RuntimeModelProvider {
  id: string;
  label: string;
  mode: "cloud" | "linked" | "local";
  ready: boolean;
  baseUrl?: string;
  discovery: "configured" | "live" | "unavailable";
  detail: string;
  models: RuntimeModelOption[];
}
export type RuntimeModelCapabilityId =
  | "chat"
  | "research"
  | "image"
  | "speech"
  | "transcription";
export interface RuntimeModelCapability {
  id: RuntimeModelCapabilityId;
  label: string;
  modelType: string;
  handlerRegistered: boolean;
  state: "available" | "unavailable";
  detail: string;
}
export interface RuntimeModelsResponse {
  activeProvider: string;
  activeModel: string;
  activeReasoningEffort?: RuntimeReasoningEffort;
  refreshedAt: string;
  providers: RuntimeModelProvider[];
  capabilities: RuntimeModelCapability[];
}
export interface PluginsResponse {
  catalog?: unknown[];
  grouped?: Record<string, unknown[]>;
  serviceRegistry?: unknown;
  pluginManager?: unknown;
  ownership?: Record<string, unknown>;
}
export interface SettingsResponse {
  settings: Record<string, unknown>;
}
export interface ThemeResponse {
  active: string;
  profile: unknown;
  themes: unknown[];
}
export interface AccountsResponse {
  activeProvider?: string;
  accounts?: Record<string, unknown>;
  connect?: Record<string, unknown>;
}
export type AccountPoolProvider =
  | "openai-codex"
  | "anthropic-subscription"
  | "openai-api"
  | "anthropic-api";
export type AccountPoolStrategy =
  | "priority"
  | "round-robin"
  | "least-used"
  | "quota-aware";
export interface AccountPoolAccount {
  providerId: AccountPoolProvider;
  accountId: string;
  label: string;
  source: "oauth" | "api-key";
  enabled: boolean;
  priority: number;
  createdAt: number;
  lastUsedAt?: number;
  health: string;
  healthDetail?: unknown;
  usage?: unknown;
}
export interface AccountPoolProviderSnapshot {
  strategy: AccountPoolStrategy;
  accounts: AccountPoolAccount[];
}
export interface AccountPoolResponse {
  bridgeInstalled: boolean;
  providers: Partial<Record<AccountPoolProvider, AccountPoolProviderSnapshot>>;
}
export interface AccountPoolDeleteResponse {
  deleted: boolean;
  credentialsRetained: false;
}
export type ProviderAuthProvider = "codex" | "claude-code";
export interface ProviderAuthStartOptions {
  accountId?: string;
  label?: string;
}
export type ProviderAuthPhase =
  | "idle"
  | "launching"
  | "waiting"
  | "succeeded"
  | "failed"
  | "cancelled";
export interface ProviderAuthState {
  provider: ProviderAuthProvider;
  phase: ProviderAuthPhase;
  message: string;
  browserOpened: boolean;
  needsCodeSubmission: boolean;
  codeSubmitted: boolean;
  startedAt?: string;
  updatedAt: string;
}
export interface PersonalityResponse {
  profile?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  card?: Record<string, unknown>;
  beliefs?: Record<string, unknown>;
  engagement?: unknown;
  relationship?: unknown;
  context?: unknown;
  hits?: unknown[];
  users?: unknown[];
  userId?: string;
  result?: Record<string, unknown>;
}
/** The exact read-only response returned by GET /profiles/users/recall. */
export interface SavedProfileRecallHit {
  kind: string;
  value: string;
  score: number;
}
export interface SavedProfileRecallResponse {
  hits: SavedProfileRecallHit[];
}
export interface SkillsResponse {
  skills?: unknown[];
  hub?: unknown;
  workspace?: unknown;
  summary?: Record<string, unknown>;
  installed?: unknown;
}
export interface SkillsSummaryResponse {
  summary?: unknown;
  hub?: unknown;
  installed?: unknown;
}
export interface ToolResponse {
  tools?: unknown[];
  summary?: unknown;
  nativePluginManager?: unknown;
}
export interface ToolSummaryResponse {
  summary?: unknown;
  nativePluginManager?: unknown;
}
export interface SettingsMutationRequest {
  path: string;
  value: unknown;
}
export interface ThemeMutationRequest {
  theme?: string;
}
export interface AccountActionRequest {
  provider?: string;
}
export interface PersonalityActionRequest {
  userId?: string;
  query?: string;
  mode?: string;
}
