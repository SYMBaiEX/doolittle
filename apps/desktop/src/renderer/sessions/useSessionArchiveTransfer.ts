import { type ChangeEvent, useRef, useState } from "react";
import type { SessionSummary } from "../../shared/contracts";
import { desktopRequest } from "../lib";

interface Preview {
  sourceApplication: string;
  title?: string;
  messageCount: number;
  attachmentCount: number;
  omissionNotices: string[];
}
interface ExportResponse {
  archive: unknown;
}
interface PreviewResponse {
  preview: Preview;
}
interface ImportResponse {
  imported: { sessionId: string; importedMessageCount: number };
}

export function useSessionArchiveTransfer({
  active,
  selected,
  projectId,
  refresh,
  openChat,
}: {
  active: boolean;
  selected?: SessionSummary;
  projectId?: string | null;
  refresh: () => void;
  openChat: (id: string) => void;
}) {
  const archiveInputRef = useRef<HTMLInputElement>(null);
  const [mutationError, setMutationError] = useState("");
  const [transferStatus, setTransferStatus] = useState("");
  const [transferring, setTransferring] = useState(false);
  const exportArchive = async () => {
    if (!active || !selected || transferring) return;
    setMutationError("");
    setTransferStatus("Preparing portable archive…");
    setTransferring(true);
    try {
      const response = await desktopRequest<ExportResponse>(
        `/sessions/export?sessionId=${encodeURIComponent(selected.sessionId)}`,
      );
      const url = URL.createObjectURL(
        new Blob([`${JSON.stringify(response.archive, null, 2)}\n`], {
          type: "application/json",
        }),
      );
      const link = document.createElement("a");
      const basename = (
        selected.title ||
        selected.preview?.[0] ||
        "doolittle-session"
      )
        .replace(/[^\p{L}\p{N}._-]+/gu, "-")
        .replace(/^-+|-+$/gu, "")
        .slice(0, 80);
      link.download = `${basename || "doolittle-session"}.doolittle.json`;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setTransferStatus(
        `Exported ${selected.messageCount} messages. Attachment descriptors are included; local binary files stay on this device.`,
      );
    } catch (error) {
      setMutationError(
        `Could not export the session: ${error instanceof Error ? error.message : String(error)}`,
      );
      setTransferStatus("");
    } finally {
      setTransferring(false);
    }
  };
  const importArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!active || !file || transferring) return;
    setMutationError("");
    setTransferStatus("Validating archive before import…");
    setTransferring(true);
    try {
      if (file.size > 2_000_000)
        throw new Error("Archive exceeds the 2 MB safety limit.");
      const archive = JSON.parse(await file.text()) as unknown;
      const { preview } = await desktopRequest<PreviewResponse>(
        "/sessions/import/preview",
        "POST",
        { archive },
      );
      const destination =
        projectId && projectId !== "unscoped"
          ? "the current project"
          : "Unscoped chats";
      const confirmed = window.confirm(
        `Import “${preview.title || "Untitled conversation"}” from ${preview.sourceApplication}?\n\n${preview.messageCount} messages · ${preview.attachmentCount} attachment descriptors\nDestination: ${destination}${preview.omissionNotices.length ? `\n\n${preview.omissionNotices.join("\n")}` : ""}`,
      );
      if (!confirmed) {
        setTransferStatus("Import cancelled. No local data changed.");
        return;
      }
      const { imported } = await desktopRequest<ImportResponse>(
        "/sessions/import",
        "POST",
        {
          archive,
          ...(projectId && projectId !== "unscoped" ? { projectId } : {}),
        },
      );
      refresh();
      setTransferStatus(
        `Imported ${imported.importedMessageCount} messages into a new local conversation.`,
      );
      openChat(imported.sessionId);
    } catch (error) {
      setMutationError(
        `Could not import the archive: ${error instanceof Error ? error.message : String(error)}`,
      );
      setTransferStatus("");
    } finally {
      setTransferring(false);
    }
  };
  return {
    archiveInputRef,
    mutationError,
    transferStatus,
    transferring,
    exportArchive,
    importArchive,
  };
}
