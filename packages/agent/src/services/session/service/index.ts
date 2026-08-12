import type { SessionServiceApi } from "./api";
import { createSessionServiceState } from "./composition";
import { sessionServiceProjectMethods } from "./project-methods";
import { sessionServiceReadMethods } from "./read-methods";
import { setSessionServiceState } from "./state";
import { sessionServiceSummaryMethods } from "./summary-methods";
import { sessionServiceTransferMethods } from "./transfer-methods";
import { sessionServiceWriteMethods } from "./write-methods";

export {
  type DoolittleSessionArchiveV1,
  type ImportSessionArchiveInput,
  type ImportSessionArchiveResult,
  type SessionArchivePreview,
  SessionTransferError,
} from "../../session-transfer";
export { SessionForkError } from "./write";

/**
 * Doolittle's query projection for Eliza-owned conversation memories plus
 * product-only project, fork, title, import/export, and usage metadata.
 *
 * Chat turns persist through AgentRuntime first. The message rows here are a
 * synchronous desktop/CLI read model, not an independent conversation source.
 */
export class SessionService {
  declare storeMessage: SessionServiceApi["storeMessage"];
  declare replaceSessionMessages: SessionServiceApi["replaceSessionMessages"];
  declare deleteLatestExchange: SessionServiceApi["deleteLatestExchange"];
  declare forkSession: SessionServiceApi["forkSession"];
  declare exportSessionArchive: SessionServiceApi["exportSessionArchive"];
  declare previewSessionArchive: SessionServiceApi["previewSessionArchive"];
  declare importSessionArchive: SessionServiceApi["importSessionArchive"];
  declare onActivity: SessionServiceApi["onActivity"];
  declare search: SessionServiceApi["search"];
  declare recent: SessionServiceApi["recent"];
  declare recentBySession: SessionServiceApi["recentBySession"];
  declare messagesBySession: SessionServiceApi["messagesBySession"];
  declare countBySessionRole: SessionServiceApi["countBySessionRole"];
  declare latest: SessionServiceApi["latest"];
  declare summary: SessionServiceApi["summary"];
  declare summarize: SessionServiceApi["summarize"];
  declare listSessions: SessionServiceApi["listSessions"];
  declare listTitled: SessionServiceApi["listTitled"];
  declare resolveByTitle: SessionServiceApi["resolveByTitle"];
  declare usage: SessionServiceApi["usage"];
  declare analytics: SessionServiceApi["analytics"];
  declare rename: SessionServiceApi["rename"];
  declare metadata: SessionServiceApi["metadata"];
  declare continuity: SessionServiceApi["continuity"];
  declare continuityKey: SessionServiceApi["continuityKey"];
  declare listProjects: SessionServiceApi["listProjects"];
  declare getProject: SessionServiceApi["getProject"];
  declare createProject: SessionServiceApi["createProject"];
  declare updateProject: SessionServiceApi["updateProject"];
  declare archiveProject: SessionServiceApi["archiveProject"];
  declare projectResources: SessionServiceApi["projectResources"];
  declare addProjectResource: SessionServiceApi["addProjectResource"];
  declare removeProjectResource: SessionServiceApi["removeProjectResource"];
  declare assignSessionProject: SessionServiceApi["assignSessionProject"];
  declare projectIdForSession: SessionServiceApi["projectIdForSession"];

  constructor(baseDir: string) {
    setSessionServiceState(this, createSessionServiceState(baseDir));
  }
}

Object.assign(
  SessionService.prototype,
  sessionServiceWriteMethods,
  sessionServiceReadMethods,
  sessionServiceSummaryMethods,
  sessionServiceProjectMethods,
  sessionServiceTransferMethods,
);
