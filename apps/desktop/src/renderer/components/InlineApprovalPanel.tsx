import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useState } from "react";
import {
  type ActionFeedback,
  asArray,
  asRecord,
  asString,
  desktopRequest,
  displayTimestamp,
  errorMessage,
  useApiResource,
} from "../lib";
import "../inline-approval-panel.css";

interface ApprovalListResponse {
  approvals?: unknown[];
}

interface InlineApprovalPanelProps {
  active: boolean;
}

export function InlineApprovalPanel({ active }: InlineApprovalPanelProps) {
  const resource = useApiResource<ApprovalListResponse>(
    active ? "/execution/approvals?status=pending" : null,
    [active],
  );
  const [busyId, setBusyId] = useState("");
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const approvals = asArray(resource.data?.approvals)
    .map((approval) => asRecord(approval))
    .filter((approval) => asString(approval.id))
    .slice(0, 3);

  useIntervalWhenDocumentVisible(resource.reload, 5_000, active);

  const decide = async (
    approval: Record<string, unknown>,
    decision: "approve" | "deny",
  ) => {
    const id = asString(approval.id);
    if (!id || busyId) return;
    setBusyId(id);
    setFeedback(null);
    try {
      await desktopRequest(
        `/execution/approvals/${encodeURIComponent(id)}/${decision}`,
        "POST",
        {},
      );
      setFeedback({
        message:
          decision === "approve"
            ? "Approved. The matching command can continue."
            : "Denied. The command was not executed.",
        tone: "good",
      });
      resource.reload();
    } catch (error) {
      setFeedback({ message: errorMessage(error), tone: "bad" });
    } finally {
      setBusyId("");
    }
  };

  if (!approvals.length) return null;

  return (
    <section
      aria-label="Pending agent approvals"
      className="inline-approval-panel"
    >
      <header>
        <span aria-hidden="true">!</span>
        <div>
          <strong>Agent needs your approval</strong>
          <small>
            {approvals.length} pending request
            {approvals.length === 1 ? "" : "s"} in this local runtime
          </small>
        </div>
      </header>
      <div className="inline-approval-list">
        {approvals.map((approval) => {
          const id = asString(approval.id);
          const isBusy = busyId === id;
          return (
            <article key={id}>
              <div>
                <code>{asString(approval.command, "Protected command")}</code>
                <p>
                  {asString(
                    approval.reason,
                    "Doolittle requested permission before continuing.",
                  )}
                </p>
                <small>
                  Expires {displayTimestamp(asString(approval.expiresAt))}
                </small>
              </div>
              <div className="inline-approval-actions">
                <button
                  className="primary-button"
                  disabled={Boolean(busyId)}
                  onClick={() => void decide(approval, "approve")}
                  type="button"
                >
                  {isBusy ? "Working…" : "Approve"}
                </button>
                <button
                  className="text-button"
                  disabled={Boolean(busyId)}
                  onClick={() => void decide(approval, "deny")}
                  type="button"
                >
                  Deny
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {feedback ? (
        <p
          aria-live={feedback.tone === "bad" ? "assertive" : "polite"}
          className={`inline-approval-feedback ${feedback.tone}`}
          role={feedback.tone === "bad" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
