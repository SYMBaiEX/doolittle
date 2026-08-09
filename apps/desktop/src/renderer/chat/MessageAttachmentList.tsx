import type { ManagedAttachmentDescriptor } from "../../shared/contracts";
import { attachmentSize } from "./models";

export function MessageAttachmentList({
  attachments,
}: {
  attachments?: ManagedAttachmentDescriptor[];
}) {
  if (!attachments?.length) return null;
  return (
    <ul aria-label="Message attachments" className="chat-message-attachments">
      {attachments.map((attachment) => (
        <li key={attachment.id}>
          <span aria-hidden="true" className="chat-message-attachment-icon">
            {attachment.kind === "image" ? "◫" : "◇"}
          </span>
          <span className="chat-message-attachment-copy">
            <strong>{attachment.name}</strong>
            <small>
              {attachment.kind} · {attachmentSize(attachment.sizeBytes)}
            </small>
          </span>
        </li>
      ))}
    </ul>
  );
}
