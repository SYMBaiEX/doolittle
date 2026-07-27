import type { Media } from "@elizaos/core";

export interface ChatAttachmentDescriptor {
  id: string;
  name: string;
  kind: "audio" | "document" | "image" | "video";
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface ChatTurnRequest {
  message: string;
  userId: string;
  roomId?: string;
  /** Caller-provided opaque id used to address a running turn for cancellation. */
  runId?: string;
  source?: string;
  attachments?: Media[];
  attachmentDescriptors?: ChatAttachmentDescriptor[];
}
