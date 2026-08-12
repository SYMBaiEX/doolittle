import type { ReactNode } from "react";
import { MessageContent } from "../components/MessageContent";
import {
  type ParsedAgentMessage,
  parseAgentMessage,
} from "../components/message-output";
import { displayTimestamp } from "../lib";
import { MessageAttachmentList } from "./MessageAttachmentList";
import type { DisplayMessage, RunReceipt } from "./models";
import { RunReceiptView } from "./RunReceiptView";

export function ChatMessage({
  message,
  receipt,
  actions,
}: {
  message: DisplayMessage;
  receipt?: RunReceipt;
  actions: ReactNode;
}) {
  const parsedAgentMessage: ParsedAgentMessage | undefined =
    message.role === "assistant" && message.content
      ? parseAgentMessage(message.content)
      : undefined;
  const hasToolActivity = Boolean(parsedAgentMessage?.tools.length);
  const receiptNeedsAttention = Boolean(
    receipt &&
      (receipt.latest.run.pendingApprovals > 0 ||
        receipt.latest.run.errorMessage ||
        receipt.latest.run.status === "error" ||
        receipt.latest.run.status === "cancelled"),
  );
  const showRunReceipt = Boolean(
    receipt &&
      (receiptNeedsAttention ||
        (!hasToolActivity &&
          (message.pending || receipt.latest.run.localMutations.length > 0))),
  );

  return (
    <article
      className={`chat-message ${message.role} ${message.error ? "error" : ""}`}
    >
      <div className="chat-message-label">
        <strong>
          <span aria-hidden="true" className="chat-message-avatar">
            {message.role === "assistant" ? "D" : "Y"}
          </span>
          <span>{message.role === "assistant" ? "Doolittle" : "You"}</span>
        </strong>
        <time>{displayTimestamp(message.createdAt)}</time>
      </div>
      <div className="chat-message-body">
        {receipt && showRunReceipt ? (
          <RunReceiptView
            pending={Boolean(message.pending)}
            receipt={receipt}
          />
        ) : null}
        {message.content ? (
          <MessageContent
            content={message.content}
            parsedAgentMessage={parsedAgentMessage}
            pending={message.pending}
            separateAgentEvents={message.role === "assistant"}
          />
        ) : message.pending && !receipt ? (
          <span className="thinking">Thinking</span>
        ) : null}
        <MessageAttachmentList attachments={message.attachments} />
        {message.role === "user" && message.memoryMatch ? (
          <p className="chat-message-memory-source">
            {message.memoryMatch.count > 0
              ? `${message.memoryMatch.count} saved profile ${
                  message.memoryMatch.count === 1 ? "match" : "matches"
                } available to this turn`
              : "No saved profile matches for this turn"}
          </p>
        ) : null}
      </div>
      <footer className="chat-message-footer">{actions}</footer>
    </article>
  );
}
