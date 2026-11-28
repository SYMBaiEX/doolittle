import { useVisibleInterval } from "@doolittle/ui/environment";
import { useEffect, useState } from "react";
import {
  approvalShortcutAriaKey,
  approvalShortcutLabel,
} from "../approval-shortcuts";
import {
  APPROVAL_WAIT_REFRESH_MS,
  approvalWaitSnapshot,
} from "../approval-waiting";
import { asString, displayTimestamp } from "../lib";
import {
  REVIEW_ACTIONS_CLASS,
  REVIEW_COMMAND_CLASS,
  REVIEW_DETAIL_BODY_CLASS,
  REVIEW_FACTS_CLASS,
} from "./layout";
import type { ReviewItem } from "./models";

export interface ReviewApprovalPanelProps {
  selected: ReviewItem;
  busy: string;
  onDecision: (decision: "approve" | "deny") => void;
}

export function ReviewApprovalPanel({ selected }: ReviewApprovalPanelProps) {
  const pending = selected.status === "pending";
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (pending && selected.id) setNowMs(Date.now());
  }, [pending, selected.id]);
  useVisibleInterval(
    () => setNowMs(Date.now()),
    APPROVAL_WAIT_REFRESH_MS,
    pending,
  );
  const wait = pending
    ? approvalWaitSnapshot(
        selected.raw.createdAt,
        selected.raw.expiresAt,
        nowMs,
      )
    : undefined;
  return (
    <div className={`${REVIEW_DETAIL_BODY_CLASS} review-decision`}>
      <div className={REVIEW_COMMAND_CLASS}>
        <span>Requested command</span>
        <code>{asString(selected.raw.command)}</code>
      </div>
      <dl className={REVIEW_FACTS_CLASS}>
        <div>
          <dt>Reason</dt>
          <dd>{asString(selected.raw.reason, "Not provided")}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>
            {asString(selected.raw.platform, "desktop")} ·{" "}
            {asString(selected.raw.sessionKey, "local session")}
          </dd>
        </div>
        <div>
          <dt>Requested</dt>
          <dd>{displayTimestamp(asString(selected.raw.createdAt))}</dd>
        </div>
        {pending ? (
          <div>
            <dt>Waiting</dt>
            <dd className={wait?.tone === "stale" ? "text-[var(--warn)]" : ""}>
              {wait?.elapsedText ?? "Not provided"}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Expires</dt>
          <dd>
            {displayTimestamp(asString(selected.raw.expiresAt))}
            {wait?.expiryText ? ` · ${wait.expiryText}` : ""}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// Pending decision controls render outside the scrolling detail content, in
// the docked footer ReviewDetail owns, so they stay visible while the command
// and metadata scroll above them.
export function ReviewApprovalActions({
  busy,
  onDecision,
}: Pick<ReviewApprovalPanelProps, "busy" | "onDecision">) {
  return (
    <div className={REVIEW_ACTIONS_CLASS}>
      <WorkbenchAction
        aria-keyshortcuts={approvalShortcutAriaKey("approve")}
        emphasis="primary"
        icon={Check}
        disabled={Boolean(busy)}
        onClick={() => onDecision("approve")}
        type="button"
      >
        {busy === "approve" ? "Approving…" : "Approve"}
      </WorkbenchAction>
      <WorkbenchAction
        aria-keyshortcuts={approvalShortcutAriaKey("deny")}
        emphasis="danger"
        icon={X}
        disabled={Boolean(busy)}
        onClick={() => onDecision("deny")}
        type="button"
      >
        {busy === "deny" ? "Denying…" : "Deny"}
      </WorkbenchAction>
      <small>
        Approval permits the agent to run the matching command. Keyboard:{" "}
        {approvalShortcutLabel("approve")} approve ·{" "}
        {approvalShortcutLabel("deny")} deny.
      </small>
    </div>
  );
}

import { Check, X } from "lucide-react";
import { WorkbenchAction } from "../components/workbench/Workbench";
