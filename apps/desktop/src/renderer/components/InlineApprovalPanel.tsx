import { Button } from "@elizaos/ui/components/ui/button";
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
      className="relative -mt-2 mb-[11px] grid w-[calc(100%+39px)] gap-2 rounded-[var(--radius-sm)] border border-[var(--accent-border)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--accent)_13%,transparent),transparent_62%),var(--surface)] p-2.5 text-[var(--text)] shadow-[0_10px_28px_color-mix(in_srgb,var(--shadow)_35%,transparent)]"
    >
      <header className="flex items-center gap-[9px]">
        <span
          aria-hidden="true"
          className="grid size-[23px] place-items-center rounded-full bg-[var(--accent)] font-[var(--font-mono)] text-[11px] font-black text-[#1a0d03]"
        >
          !
        </span>
        <div className="grid gap-px">
          <strong className="text-xs">Agent needs your approval</strong>
          <small className="text-[10px] text-[var(--muted)]">
            {approvals.length} pending request
            {approvals.length === 1 ? "" : "s"} in this local runtime
          </small>
        </div>
      </header>
      <div className="grid gap-1.5">
        {approvals.map((approval) => {
          const id = asString(approval.id);
          const isBusy = busyId === id;
          return (
            <article
              className="grid grid-cols-1 items-center gap-2.5 rounded-[var(--radius-xs)] border border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] p-2 min-[701px]:grid-cols-[minmax(0,1fr)_auto]"
              key={id}
            >
              <div className="grid min-w-0 gap-[3px]">
                <code className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[var(--text-soft)]">
                  {asString(approval.command, "Protected command")}
                </code>
                <p className="m-0 text-[10px] leading-[1.4] text-[var(--muted)]">
                  {asString(
                    approval.reason,
                    "Doolittle requested permission before continuing.",
                  )}
                </p>
                <small className="text-[10px] text-[var(--muted)]">
                  Expires {displayTimestamp(asString(approval.expiresAt))}
                </small>
              </div>
              <div className="flex items-center justify-end gap-1.5 min-[701px]:justify-start">
                <Button
                  className="h-[26px] min-h-[26px] px-2 text-[10px]"
                  disabled={Boolean(busyId)}
                  onClick={() => void decide(approval, "approve")}
                  size="sm"
                  type="button"
                >
                  {isBusy ? "Working…" : "Approve"}
                </Button>
                <Button
                  className="h-[26px] min-h-[26px] px-2 text-[10px]"
                  disabled={Boolean(busyId)}
                  onClick={() => void decide(approval, "deny")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Deny
                </Button>
              </div>
            </article>
          );
        })}
      </div>
      {feedback ? (
        <p
          aria-live={feedback.tone === "bad" ? "assertive" : "polite"}
          className={`m-0 text-[10px] leading-[1.4] ${
            feedback.tone === "bad"
              ? "text-[var(--bad)]"
              : "text-[var(--accent)]"
          }`}
          role={feedback.tone === "bad" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
}
