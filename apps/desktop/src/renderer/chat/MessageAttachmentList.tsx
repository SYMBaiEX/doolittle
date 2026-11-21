import { Button, ContextActionMenu } from "@doolittle/ui";
import { FileText, Film, Image, MoreHorizontal, Music2 } from "lucide-react";
import type {
  ManagedAttachmentDescriptor,
  ManagedAttachmentKind,
} from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { copyContextText } from "../context-menu-clipboard";
import { attachmentSize } from "./models";

const attachmentIcons = {
  audio: Music2,
  document: FileText,
  image: Image,
  video: Film,
} satisfies Record<ManagedAttachmentKind, typeof FileText>;

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
                className="chat-turn-action"
                size="sm"
                title="Attachment actions"
                type="button"
                variant="ghost"
              >
                <UiIcon icon={MoreHorizontal} size="sm" />
              </Button>
            }
          >
            <span aria-hidden="true" className="chat-message-attachment-icon">
              <UiIcon icon={attachmentIcons[attachment.kind]} size="sm" />
            </span>
            <span className="chat-message-attachment-copy">
              <strong title={attachment.name}>{attachment.name}</strong>
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
