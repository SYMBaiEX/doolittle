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
  if (message.role === "user") return message.content;
  const hasMutationFailure = UNFINISHED_MUTATION_FAILURE.test(message.content);
  UNFINISHED_MUTATION_FAILURE.lastIndex = 0;
  let content = message.content;
  if (
    !message.error &&
    !hasMutationFailure &&
    receipt?.latest.run.status !== "error"
  )
    return content;
  let fence: { marker: string; length: number } | undefined;
  content = content
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
      if (marker?.[1]) {
        if (!fence) {
          fence = { marker: marker[1][0] ?? "`", length: marker[1].length };
        } else if (
          marker[1][0] === fence.marker &&
          marker[1].length >= fence.length &&
          !marker[2]?.trim()
        ) {
          fence = undefined;
        }
        return line;
      }
      // Failure phrases can also appear in literal code or quoted test fixtures.
      if (fence || /^(?: {4}|\t)/u.test(line)) return line;
      let cleaned = line.replace(
        UNFINISHED_MUTATION_FAILURE,
        "No verified file change was completed.",
      );
      if (receipt?.latest.run.errorMessage) {
        cleaned = cleaned.replace(receipt.latest.run.errorMessage, "");
      }
      if (receipt)
        cleaned = cleaned.replace("No verified file change was completed.", "");
      for (const pattern of FAILURE_BOILERPLATE)
        cleaned = cleaned.replace(pattern, "");
      return cleaned;
    })
    .join("\n");
  // A partial response may contain useful code, lists or tables. Removing run
  // boilerplate must never normalize the authored whitespace inside them.
  return content
    .replace(/^(?:[ \t]*\r?\n)+|(?:\r?\n[ \t]*)+$/gu, "")
    .replace(/^[ \t]{1,3}(?=\S)|[ \t]+$/gu, "");
}

export function ChatMessage({
  message,
  botName = "Doolittle",
  receipt,
  actions,
  retryDisabled,
  onRetry,
}: {
  message: DisplayMessage;
  botName?: string;
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
  const messageState =
    receipt?.latest.run.status === "cancelled"
      ? "stopped"
      : message.error || receipt?.latest.run.status === "error"
        ? "error"
        : receipt && receipt.latest.run.pendingApprovals > 0
          ? "waiting"
          : message.pending
            ? "streaming"
            : "complete";
  return (
    <article
      className={`chat-message group ${message.role} ${message.error && !showRunReceipt ? "error" : ""}`}
      data-message-role={message.role}
      data-message-state={messageState}
    >
      <div className="chat-message-label">
        <strong>
          <span aria-hidden="true" className="chat-message-avatar">
            {message.role === "assistant" ? botName.slice(0, 1) : "Y"}
          </span>
          <span>{message.role === "assistant" ? botName : "You"}</span>
        </strong>
        <time dateTime={message.createdAt}>
          {displayTimestamp(message.createdAt)}
        </time>
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
            {botName} is working
          </span>
        ) : null}
        {message.error && !showRunReceipt ? (
          <div className="chat-history-notice" role="alert">
            <span>Response could not be completed.</span>
            {onRetry ? (
              <button
                aria-label="Retry failed response in a new branch"
                className="text-button"
                disabled={retryDisabled}
                onClick={onRetry}
                type="button"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : !visibleContent &&
          !message.pending &&
          !showRunReceipt &&
          message.role === "assistant" ? (
          <p className="text-[var(--muted)]">No response text was returned.</p>
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
