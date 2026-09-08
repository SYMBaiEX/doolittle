import type { ReactNode } from "react";
import { MessageContent } from "../components/MessageContent";
import {
  type ParsedAgentMessage,
  parseAgentMessage,
} from "../components/message-output";
import { displayTimestamp } from "../lib";
import { ContextCapsuleIcon } from "./ContextCapsuleIcon";
import { MessageAttachmentList } from "./MessageAttachmentList";
import type { DisplayMessage, RunReceipt } from "./models";
import { RunReceiptView } from "./RunReceiptView";

const FAILURE_BOILERPLATE = [
  /Something went wrong while I was working on that\.?/giu,
  /Please try again,? and I(?:'|’)ll pick it back up\.?/giu,
  /Please try again,? and I(?:'|’)ll take another pass\.?/giu,
  /Response interrupted(?::[^\n]+)?\.?/giu,
  /Retry to continue\.?/giu,
];

const UNFINISHED_MUTATION_FAILURE =
  /I stopped before completing the requested workspace change\. No verified local mutation receipt was recorded \([^)]*\), so this turn was not marked complete\.?/giu;

/** Keep useful partial output while removing errors already explained by the run card. */
export function messageContentAfterReceipt(
  message: DisplayMessage,
  receipt?: RunReceipt,
): string {
  const hasMutationFailure = UNFINISHED_MUTATION_FAILURE.test(message.content);
  UNFINISHED_MUTATION_FAILURE.lastIndex = 0;
  let content = message.content.replace(
    UNFINISHED_MUTATION_FAILURE,
    "No verified file change was completed.",
  );
  if (!message.error && !hasMutationFailure) return content;
  if (receipt?.latest.run.errorMessage) {
    content = content.replace(receipt.latest.run.errorMessage, "");
  }
  if (receipt)
    content = content.replace("No verified file change was completed.", "");
  for (const pattern of FAILURE_BOILERPLATE)
    content = content.replace(pattern, "");
  return content.replace(/\s{2,}/gu, " ").trim();
}

export function ChatMessage({
  message,
  receipt,
  actions,
  retryDisabled,
  onRetry,
}: {
  message: DisplayMessage;
  receipt?: RunReceipt;
  actions: ReactNode;
  retryDisabled?: boolean;
  onRetry?: () => void;
}) {
  const visibleContent = messageContentAfterReceipt(message, receipt);
  const parsedAgentMessage: ParsedAgentMessage | undefined =
    message.role === "assistant" && visibleContent
      ? parseAgentMessage(visibleContent)
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
          ((receipt.latest.run.status === "complete" &&
            receipt.latest.run.observedActionCount > 0) ||
            message.pending ||
            receipt.latest.run.localMutations.length > 0))),
  );
  return (
    <article
      className={`chat-message group ${message.role} ${message.error && !showRunReceipt ? "error" : ""}`}
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
            onRetry={onRetry}
            pending={Boolean(message.pending)}
            receipt={receipt}
            retryDisabled={retryDisabled}
          />
        ) : null}
        {visibleContent ? (
          <MessageContent
            content={visibleContent}
            parsedAgentMessage={parsedAgentMessage}
            pending={message.pending}
            separateAgentEvents={message.role === "assistant"}
          />
        ) : message.pending && !receipt ? (
          <span aria-live="polite" className="thinking" role="status">
            Doolittle is working
          </span>
        ) : null}
        <MessageAttachmentList attachments={message.attachments} />
        {message.role === "user" && message.contextCapsule ? (
          <div
            aria-label={
              "Attached " +
              message.contextCapsule.kind +
              " context for " +
              message.contextCapsule.path
            }
            className="chat-message-context-capsule"
            role="note"
          >
            <span aria-hidden="true">
              <ContextCapsuleIcon kind={message.contextCapsule.kind} />
            </span>
            <span>
              {message.contextCapsule.kind === "diff"
                ? "Diff"
                : message.contextCapsule.kind === "review"
                  ? "Review"
                  : message.contextCapsule.kind === "brief"
                    ? "Brief"
                    : message.contextCapsule.kind === "plan"
                      ? "Plan"
                      : message.contextCapsule.kind === "terminal"
                        ? "Terminal"
                        : message.contextCapsule.kind === "browser"
                          ? "Browser"
                          : "Source"}{" "}
              · {message.contextCapsule.path}
            </span>
            {message.contextCapsule.source ? (
              <small>{message.contextCapsule.source}</small>
            ) : null}
          </div>
        ) : null}
        {message.role === "user" &&
        message.memoryMatch &&
        message.memoryMatch.count > 0 ? (
          <p className="chat-message-memory-source">
            {`${message.memoryMatch.count} saved profile ${
              message.memoryMatch.count === 1 ? "match" : "matches"
            } available to this turn`}
          </p>
        ) : null}
      </div>
      <footer className="chat-message-footer">{actions}</footer>
    </article>
  );
}
