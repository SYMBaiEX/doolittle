import { parseWalletActivityReceipt } from "@doolittle/contracts/wallet-activity";
import { AlertCircle, Bot, LoaderCircle } from "lucide-react";
import { type ReactNode, useId, useMemo } from "react";
import { MessageContent } from "../components/MessageContent";
import {
  markdownCodeFences,
  type ParsedAgentMessage,
  parseAgentMessage,
} from "../components/message-output";
import { UiIcon } from "../components/UiIcon";
import { WalletActivityCard } from "../components/WalletActivityCard";
import { displayTimestamp } from "../lib";
import { ContextCapsuleIcon, contextCapsuleLabel } from "./ContextCapsuleIcon";
import { MessageAttachmentList } from "./MessageAttachmentList";
import type { DisplayMessage, RunReceipt } from "./models";
import { RunReceiptView } from "./RunReceiptView";
import {
  deriveTurnActivitySummary,
  formatTurnActivitySummary,
} from "./turn-activity-summary";
import "./turn-activity-summary.css";

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
  const fences = markdownCodeFences(content);
  let fence = fences.next().value;
  let offset = 0;
  content = content
    .split("\n")
    .map((line) => {
      const start = offset;
      offset += line.length + 1;
      while (fence && fence.end <= start) fence = fences.next().value;
      // Failure phrases can also appear in literal code or quoted test fixtures.
      if ((fence && fence.start <= start) || /^(?: {4}|\t)/u.test(line))
        return line;
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
  progress,
  receipt,
  actions,
  retryDisabled,
  onRetry,
  onViewChanges,
}: {
  message: DisplayMessage;
  botName?: string;
  progress?: string;
  receipt?: RunReceipt;
  actions: ReactNode;
  retryDisabled?: boolean;
  onRetry?: () => void;
  onViewChanges?: () => void;
}) {
  const authorId = useId();
  const timestampId = useId();
  const assistant = message.role === "assistant";
  const author = assistant ? botName : "You";
  const visibleContent = messageContentAfterReceipt(message, receipt);
  const parsedAgentMessage = useMemo<ParsedAgentMessage | undefined>(
    () =>
      assistant && visibleContent
        ? parseAgentMessage(visibleContent)
        : undefined,
    [assistant, visibleContent],
  );
  const hasToolActivity = Boolean(parsedAgentMessage?.tools.length);
  const hasRecordedActivity = Boolean(
    receipt?.events.some((event) => event.activity),
  );
  const renderedContent =
    parsedAgentMessage && hasRecordedActivity && hasToolActivity
      ? { ...parsedAgentMessage, tools: [] }
      : (parsedAgentMessage ?? visibleContent);
  const receiptNeedsAttention = Boolean(
    receipt &&
      (receipt.latest.run.pendingApprovals > 0 ||
        receipt.latest.run.errorMessage ||
        receipt.latest.run.status === "error" ||
        receipt.latest.run.status === "cancelled"),
  );
  const showRunReceipt = Boolean(
    assistant &&
      receipt &&
      (receiptNeedsAttention ||
        message.pending ||
        hasRecordedActivity ||
        (!hasToolActivity &&
          ((receipt.latest.run.status === "complete" &&
            receipt.latest.run.observedActionCount > 0) ||
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
  const turnActivityLabel = useMemo(() => {
    const summary = deriveTurnActivitySummary(receipt);
    return summary ? formatTurnActivitySummary(summary) : "";
  }, [receipt]);
  return (
    <article
      aria-labelledby={`${authorId} ${timestampId}`}
      className={`chat-message ${message.role}`}
      data-message-role={message.role}
      data-message-state={messageState}
    >
      <header className="chat-turn-header">
        {assistant ? (
          <span aria-hidden="true" className="chat-turn-mark">
            <UiIcon icon={Bot} size="sm" />
          </span>
        ) : null}
        <span className="chat-turn-author" id={authorId}>
          {author}
        </span>
        <time dateTime={message.createdAt} id={timestampId}>
          {displayTimestamp(message.createdAt)}
        </time>
        {assistant && !message.pending && turnActivityLabel ? (
          <span
            className="chat-turn-activity-summary"
            title={turnActivityLabel}
          >
            {turnActivityLabel}
          </span>
        ) : null}
        {assistant &&
        visibleContent &&
        messageState === "streaming" &&
        !showRunReceipt &&
        !hasToolActivity ? (
          <span className="chat-turn-streaming">
            <UiIcon icon={LoaderCircle} size="xs" />
            Responding
          </span>
        ) : null}
      </header>
      <div className="chat-turn-content">
        {receipt && showRunReceipt ? (
          <RunReceiptView
            botName={botName}
            onRetry={onRetry}
            onViewChanges={onViewChanges}
            pending={Boolean(message.pending)}
            progress={progress}
            receipt={receipt}
            retryDisabled={retryDisabled}
          />
        ) : null}
        {assistant &&
          receipt?.latest.run.walletActivities?.map((value) => {
            const wallet = parseWalletActivityReceipt(value);
            return wallet ? (
              <WalletActivityCard
                key={wallet.id ?? JSON.stringify(wallet)}
                receipt={wallet}
              />
            ) : null;
          })}
        {message.replayGap ? (
          <p className="chat-transcript-notice" role="status">
            <UiIcon icon={AlertCircle} size="sm" />
            <span>Some earlier response updates expired.</span>
          </p>
        ) : null}
        {visibleContent ? (
          <MessageContent content={renderedContent} pending={message.pending} />
        ) : message.pending && !receipt ? (
          <span className="chat-turn-working" role="status">
            <UiIcon icon={LoaderCircle} size="sm" />
            <span>{botName} is working</span>
          </span>
        ) : null}
        {message.error && !showRunReceipt ? (
          <div
            className="chat-transcript-notice chat-transcript-notice--error"
            role="alert"
          >
            <UiIcon icon={AlertCircle} size="sm" />
            <span>Response could not be completed.</span>
            {onRetry ? (
              <button
                aria-label="Retry failed response in a new branch"
                className="chat-transcript-command"
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
          assistant ? (
          <p className="chat-turn-empty">No response text was returned.</p>
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
            <span title={message.contextCapsule.path}>
              {contextCapsuleLabel(message.contextCapsule.kind)} ·{" "}
              {message.contextCapsule.path}
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
      {actions ? <footer className="chat-turn-footer">{actions}</footer> : null}
    </article>
  );
}
