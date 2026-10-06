import { Button, ContextActionMenu } from "@doolittle/ui";
import { FileText, Image, MoreHorizontal } from "lucide-react";
import type { ManagedAttachmentDescriptor } from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
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
          <ContextActionMenu
            label="Attachment actions"
            scopeKey={attachment.id}
            items={[
              {
                id: "copy-name",
                label: "Copy attachment name",
                onSelect: () => void copyContextText(attachment.name),
              },
              {
                id: "copy-details",
                label: "Copy attachment details",
                onSelect: () =>
                  void copyContextText(
                    `${attachment.name}\n${attachment.kind}\n${attachmentSize(attachment.sizeBytes)}`,
                  ),
              },
            ]}
            trigger={
              <Button
                aria-label={`Actions for attachment ${attachment.name}`}
                className="!size-10 !min-h-10 !min-w-10 !p-0 max-[760px]:!size-11 max-[760px]:!min-h-11 max-[760px]:!min-w-11"
                type="button"
                variant="ghost"
              >
                <UiIcon icon={MoreHorizontal} size="sm" />
              </Button>
            }
          >
            <span aria-hidden="true" className="chat-message-attachment-icon">
              <UiIcon
                icon={attachment.kind === "image" ? Image : FileText}
                size="sm"
              />
            </span>
            <span className="chat-message-attachment-copy">
              <strong>{attachment.name}</strong>
              <small>
                {attachment.kind} · {attachmentSize(attachment.sizeBytes)}
              </small>
            </span>
          </ContextActionMenu>
        </li>
      ))}
    </ul>
  );
}
