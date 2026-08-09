import { asString, displayTimestamp } from "../lib";
import type { ReviewItem } from "./models";

export interface ReviewApprovalPanelProps {
  selected: ReviewItem;
  busy: string;
  onDecision: (decision: "approve" | "deny") => void;
}

export function ReviewApprovalPanel({
  selected,
  busy,
  onDecision,
}: ReviewApprovalPanelProps) {
  return (
    <div className="review-decision">
      <div className="review-command">
        <span>Requested command</span>
        <code>{asString(selected.raw.command)}</code>
      </div>
      <dl className="review-facts">
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
        <div>
          <dt>Expires</dt>
          <dd>{displayTimestamp(asString(selected.raw.expiresAt))}</dd>
        </div>
      </dl>
      {selected.status === "pending" ? (
        <div className="review-actions">
          <button
            className="primary-button"
            disabled={Boolean(busy)}
            onClick={() => onDecision("approve")}
            type="button"
          >
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button
            className="danger-button"
            disabled={Boolean(busy)}
            onClick={() => onDecision("deny")}
            type="button"
          >
            {busy === "deny" ? "Denying…" : "Deny"}
          </button>
          <small>
            Approval records permission only. It does not execute a command from
            this screen.
          </small>
        </div>
      ) : null}
    </div>
  );
}
