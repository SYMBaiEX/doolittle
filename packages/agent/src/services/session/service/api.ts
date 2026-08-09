import type {
  Project,
  ProjectResource,
  SessionExchangeMutationResult,
  SessionForkInput,
  SessionForkResult,
  SessionSearchResult,
  SessionSummary,
  SessionUsageOptions,
  SessionUsageSummary,
  StoredMessage,
} from "@/types";
import type {
  DoolittleSessionArchiveV1,
  ImportSessionArchiveInput,
  ImportSessionArchiveResult,
  SessionArchivePreview,
} from "../../session-transfer";
import type { SessionMessageActivityEvent } from "../messages";
import type { SessionMetadataValue } from "../metadata";
import type {
  AddProjectResourceInput,
  CreateProjectInput,
  UpdateProjectInput,
} from "../projects/store";

export interface SessionServiceApi {
  storeMessage(message: StoredMessage): void;
  replaceSessionMessages(sessionId: string, messages: StoredMessage[]): void;
  deleteLatestExchange(
    sessionId: string,
    options?: { skipSlashCommands?: boolean },
  ): SessionExchangeMutationResult;
  forkSession(input: SessionForkInput): SessionForkResult;
  exportSessionArchive(sessionId: string): DoolittleSessionArchiveV1;
  previewSessionArchive(input: unknown): SessionArchivePreview;
  importSessionArchive(
    input: ImportSessionArchiveInput,
  ): ImportSessionArchiveResult;
  onActivity(
    listener: (event: SessionMessageActivityEvent) => void,
  ): () => void;
  search(
    query: string,
    limit: number,
    projectId?: string,
  ): SessionSearchResult[];
  recent(limit: number): SessionSearchResult[];
  recentBySession(sessionId: string, limit: number): SessionSearchResult[];
  messagesBySession(
    sessionId: string,
    limit: number,
    offset?: number,
  ): StoredMessage[];
  countBySessionRole(sessionId: string, role?: StoredMessage["role"]): number;
  latest(limit: number): SessionSearchResult[];
  summary(limit?: number): {
    totalSessions: number;
    recentSessionIds: string[];
  };
  summarize(sessionId: string, limit?: number): SessionSummary;
  listSessions(limit: number, projectId?: string): SessionSummary[];
  listTitled(limit: number): SessionSummary[];
  resolveByTitle(query: string): SessionSummary | undefined;
  usage(sessionId: string, options?: SessionUsageOptions): SessionUsageSummary;
  rename(sessionId: string, title: string): SessionSummary;
  metadata(sessionId: string): SessionMetadataValue | undefined;
  continuity(sessionId: string, limit?: number): SessionSummary[];
  continuityKey(sessionId: string): string;
  listProjects(includeArchived?: boolean): Project[];
  getProject(id: string): Project | undefined;
  createProject(input: CreateProjectInput): Project;
  updateProject(id: string, input: UpdateProjectInput): Project | undefined;
  archiveProject(id: string, archived?: boolean): Project | undefined;
  projectResources(projectId: string): ProjectResource[];
  addProjectResource(
    projectId: string,
    input: AddProjectResourceInput,
  ): ProjectResource | undefined;
  removeProjectResource(projectId: string, resourceId: string): boolean;
  assignSessionProject(sessionId: string, projectId?: string): boolean;
  projectIdForSession(sessionId: string): string | undefined;
}
