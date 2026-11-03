import { useCallback, useEffect, useRef } from "react";
import type { ManagedAttachmentDescriptor } from "../../../shared/contracts";
import type { VoiceRecorderMime } from "../../components/VoiceComposerButton";
import type { AttachmentCleanupMap } from "../../conversation-persistence";
import { desktopRequest, errorMessage } from "../../lib";
import { useWorkspaceState } from "../../session-workspace/chat-workspace-store";
import {
  MAX_MESSAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENTS,
} from "../models";

interface ChatAttachmentOptions {
  selectedId: string;
  currentBotId: string;
  coordinator: boolean;
  attachedFiles: readonly ManagedAttachmentDescriptor[];
  draftAttachmentCleanup: AttachmentCleanupMap;
  setDraftAttachments: (
    attachments: ManagedAttachmentDescriptor[],
    attachmentCleanup?: AttachmentCleanupMap,
  ) => void;
}

/** Same-panel attachment operations; draft persistence remains conversation-owned. */
export function useChatAttachments({
  selectedId,
  currentBotId,
  coordinator,
  attachedFiles,
  draftAttachmentCleanup,
  setDraftAttachments,
}: ChatAttachmentOptions) {
  const [attachmentValidationError, setAttachmentValidationError] =
    useWorkspaceState(`view.attachment-error.${selectedId}`, "");
  const [attachmentImportPending, setAttachmentImportPending] =
    useWorkspaceState(`view.attachment-importing.${selectedId}`, false);
  const attachmentRevisionRef = useRef(0);
  const selectedIdRef = useRef(selectedId);
  // A native dialog can resolve between render and the selected-session effect.
  selectedIdRef.current = selectedId;
  const previousSelectedId = useRef(selectedId);
  useEffect(() => {
    selectedIdRef.current = selectedId;
    attachmentRevisionRef.current += 1;
  }, [selectedId]);
  useEffect(() => {
    if (coordinator || previousSelectedId.current === selectedId) return;
    previousSelectedId.current = selectedId;
    setAttachmentValidationError("");
  }, [coordinator, selectedId, setAttachmentValidationError]);

  const cleanupManagedAttachments = async (
    ids: readonly string[],
    attachmentCleanup: Readonly<Record<string, string>>,
    botId = currentBotId,
  ) => {
    const byCapability = new Map<string, string[]>();
    for (const id of ids) {
      const capability = attachmentCleanup[id];
      if (!capability) continue;
      const entries = byCapability.get(capability) ?? [];
      entries.push(id);
      byCapability.set(capability, entries);
    }
    for (const [cleanupCapability, attachmentIds] of byCapability) {
      await window.doolittle.discardChatAttachments({
        ...(botId ? { botId } : {}),
        attachmentIds,
        cleanupCapability,
      });
    }
  };

  const pickContextFiles = async () => {
    if (attachmentImportPending) return;
    const sessionId = selectedId;
    const botId = currentBotId;
    const revision = attachmentRevisionRef.current;
    setAttachmentImportPending(true);
    try {
      const result = await window.doolittle.pickChatAttachments(
        botId || undefined,
      );
      if (result.canceled || result.attachments.length === 0) return;
      const cleanupCapability = result.cleanupCapability;
      const isCurrentDraft =
        selectedIdRef.current === sessionId &&
        attachmentRevisionRef.current === revision;
      if (!isCurrentDraft) {
        if (cleanupCapability) {
          await window.doolittle.discardChatAttachments({
            ...(botId ? { botId } : {}),
            attachmentIds: result.attachments.map(
              (attachment) => attachment.id,
            ),
            cleanupCapability,
          });
        }
        return;
      }
      const next = [...attachedFiles];
      const nextCleanup = { ...draftAttachmentCleanup };
      let totalBytes = next.reduce(
        (sum, attachment) => sum + attachment.sizeBytes,
        0,
      );
      let skipped = 0;
      for (const attachment of result.attachments) {
        if (next.some((entry) => entry.id === attachment.id)) continue;
        if (
          next.length >= MAX_MESSAGE_ATTACHMENTS ||
          totalBytes + attachment.sizeBytes > MAX_MESSAGE_ATTACHMENT_BYTES
        ) {
          skipped += 1;
          continue;
        }
        next.push(attachment);
        totalBytes += attachment.sizeBytes;
        if (cleanupCapability) {
          nextCleanup[attachment.id] = cleanupCapability;
        }
      }
      const acceptedIds = new Set(next.map((attachment) => attachment.id));
      const rejectedIds = result.attachments
        .map((attachment) => attachment.id)
        .filter((id) => !acceptedIds.has(id));
      if (cleanupCapability) {
        if (rejectedIds.length > 0) {
          await window.doolittle.discardChatAttachments({
            ...(botId ? { botId } : {}),
            attachmentIds: rejectedIds,
            cleanupCapability,
          });
        }
      }
      attachmentRevisionRef.current += 1;
      setDraftAttachments(next, nextCleanup);
      if (skipped > 0) {
        setAttachmentValidationError(
          `Attachment limit reached. Up to ${MAX_MESSAGE_ATTACHMENTS} files and 50 MB total are allowed.`,
        );
      } else {
        setAttachmentValidationError("");
      }
    } catch (error) {
      setAttachmentValidationError(
        `Could not add file context: ${errorMessage(error)}`,
      );
    } finally {
      setAttachmentImportPending(false);
    }
  };

  const importAndTranscribeRecording = useCallback(
    async (
      bytes: Uint8Array,
      mimeType: VoiceRecorderMime,
      name: string,
      signal: AbortSignal,
    ) => {
      if (signal.aborted) {
        throw new DOMException("Voice dictation was cancelled.", "AbortError");
      }
      const attachment = await window.doolittle.importRecordedAudio({
        ...(currentBotId ? { botId: currentBotId } : {}),
        bytes,
        mimeType,
        name,
      });
      if (signal.aborted) {
        await window.doolittle
          .discardRecordedAudio(attachment.id, currentBotId || undefined)
          .catch(() => undefined);
        throw new DOMException("Voice dictation was cancelled.", "AbortError");
      }
      try {
        const result = await desktopRequest<{
          transcription: { transcriptText: string };
        }>(
          "/media/transcribe-attachment",
          "POST",
          {
            attachmentId: attachment.id,
            name,
          },
          signal,
          undefined,
          currentBotId || undefined,
        );
        return { transcriptText: result.transcription.transcriptText };
      } catch (error) {
        await window.doolittle
          .discardRecordedAudio(attachment.id, currentBotId || undefined)
          .catch(() => undefined);
        throw error;
      }
    },
    [currentBotId],
  );

  const removeContextFile = (id: string) => {
    attachmentRevisionRef.current += 1;
    const nextAttachments = attachedFiles.filter((entry) => entry.id !== id);
    const nextCleanup = Object.fromEntries(
      Object.entries(draftAttachmentCleanup).filter(
        ([attachmentId]) => attachmentId !== id,
      ),
    );
    setDraftAttachments(nextAttachments, nextCleanup);
    setAttachmentValidationError("");
    void cleanupManagedAttachments([id], draftAttachmentCleanup).catch(
      (error) => {
        setAttachmentValidationError(
          `Could not remove file context: ${errorMessage(error)}`,
        );
      },
    );
  };

  return {
    attachmentValidationError,
    attachmentImportPending,
    setAttachmentValidationError,
    cleanupManagedAttachments,
    pickContextFiles,
    importAndTranscribeRecording,
    removeContextFile,
  };
}
