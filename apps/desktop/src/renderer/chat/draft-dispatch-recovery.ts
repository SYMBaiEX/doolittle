import type { ConversationDraft } from "../conversation-persistence";

/**
 * A send clears the composer optimistically. Its revision lets a rejected IPC
 * dispatch put that exact draft back only when the composer remained untouched.
 */
export interface DraftDispatchRecovery {
  draft: ConversationDraft;
  revision: number;
  sessionId: string;
}

export function snapshotDraftForDispatch(
  sessionId: string,
  draft: ConversationDraft,
  revision: number,
): DraftDispatchRecovery {
  return {
    sessionId,
    revision,
    draft: {
      text: draft.text,
      capsule: draft.capsule ? { ...draft.capsule } : null,
      attachments: [...draft.attachments],
    },
  };
}

export function canRestoreRejectedDispatch(
  recovery: DraftDispatchRecovery,
  currentRevision: number,
): boolean {
  return recovery.revision === currentRevision;
}
