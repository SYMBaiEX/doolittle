import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@elizaos/ui/components/ui/dialog";
import { useIntervalWhenDocumentVisible } from "@elizaos/ui/hooks/useDocumentVisibility";
import { useEffect, useRef, useState } from "react";
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
import { Button } from "./ElizaControls";

interface ApprovalListResponse {
  approvals?: unknown[];
}

interface InlineApprovalPanelProps {
  active: boolean;
  /** Use an explicit review dialog when the actual pane cannot fit inline actions. */
  compact?: boolean;
  /** Original chat room label, not the native runtime's hashed room UUID. */
  roomId: string;
}

interface ApprovalScope {
  active: boolean;
  roomId: string;
}

export function InlineApprovalPanel({
  active,
  compact = false,
  roomId,
}: InlineApprovalPanelProps) {
  const enabled = active && roomId.length > 0;
  const resource = useApiResource<ApprovalListResponse>(
    enabled ? "/execution/approvals?status=pending" : null,
    [enabled],
  );
  const scope = useRef<ApprovalScope>({ active: enabled, roomId });
  if (scope.current.active !== enabled || scope.current.roomId !== roomId)
    scope.current = { active: enabled, roomId };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState<{
    scope: ApprovalScope;
    id: string;
  } | null>(null);
  const decisionInFlight = useRef(new Set<string>());
  const [result, setResult] = useState<{
    scope: ApprovalScope;
    feedback: ActionFeedback;
  } | null>(null);
  const [openedScope, setOpenedScope] = useState<ApprovalScope | null>(null);
  const dialogOpen = openedScope === scope.current;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogOpenerScope = useRef<ApprovalScope | null>(null);
  const busyId = busy?.scope === scope.current ? busy.id : "";
  const feedback = result?.scope === scope.current ? result.feedback : null;
  const approvals = asArray(resource.data?.approvals)
    .map((approval) => asRecord(approval))
    .filter(
      (approval) =>
        approval.status === "pending" &&
        typeof approval.id === "string" &&
        approval.id.length <= 256 &&
        /^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(approval.id) &&
        approval.roomId === roomId &&
        (approval.sessionKey === undefined || approval.sessionKey === roomId),
    );
  const currentIds = useRef(new Set<string>());
  currentIds.current = new Set(
    approvals.map((approval) => asString(approval.id)),
  );

  useIntervalWhenDocumentVisible(resource.reload, 5_000, enabled);

  const decide = async (
    approval: Record<string, unknown>,
    decision: "approve" | "deny",
  ) => {
    const id = asString(approval.id);
    if (
      !enabled ||
      !currentIds.current.has(id) ||
      busyId ||
      decisionInFlight.current.has(id) ||
      resource.loading ||
      resource.error
    )
      return;
    const submittedScope = scope.current;
    const pending = { scope: submittedScope, id };
    const stillCurrent = () =>
      mounted.current &&
      scope.current === submittedScope &&
      scope.current.active &&
      currentIds.current.has(id);
    decisionInFlight.current.add(id);
    setBusy(pending);
    setResult(null);
    try {
      await desktopRequest(
        `/execution/approvals/${encodeURIComponent(id)}/${decision}`,
        "POST",
        {},
      );
      if (stillCurrent()) {
        setResult({
          scope: submittedScope,
          feedback: {
            message:
              decision === "approve"
                ? "Approved. The matching command can continue."
                : "Denied this request.",
            tone: "good",
          },
        });
        resource.reload();
      }
    } catch (error) {
      if (stillCurrent())
        setResult({
          scope: submittedScope,
          feedback: { message: errorMessage(error), tone: "bad" },
        });
    } finally {
      decisionInFlight.current.delete(id);
      if (mounted.current)
        setBusy((current) => (current === pending ? null : current));
    }
  };

  if (
    !enabled ||
    (!approvals.length && !resource.loading && !resource.error && !feedback)
  )
    return null;

  const panel = (
    <section
      data-session-approval-surface={
        compact || dialogOpen ? undefined : "inline"
      }
      aria-label="Pending approvals for this session"
      aria-busy={resource.loading || Boolean(busyId)}
      className={`mb-2 flex min-w-0 w-full flex-col gap-2 border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[var(--text)] ${compact || dialogOpen ? "max-h-[min(60dvh,520px)]" : "max-h-[min(35dvh,var(--session-approval-max-height,280px))]"}`}
    >
      <header className="grid min-w-0 shrink-0 gap-1">
        <strong className="text-[length:var(--text-body)]">
          Session approvals
        </strong>
        <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
          {resource.loading || resource.error
            ? "Only requests bound to this session are shown."
            : `${approvals.length} pending request${approvals.length === 1 ? "" : "s"} for this session.`}{" "}
          Other requests remain in Review.
        </small>
      </header>
      {resource.loading ? (
        <p
          className="m-0 text-[length:var(--text-meta)] text-[var(--muted)]"
          role="status"
        >
          Checking approvals for this session…
        </p>
      ) : null}
      {resource.error ? (
        <div className="grid min-w-0 gap-2">
          <p
            className="m-0 [overflow-wrap:anywhere] text-[length:var(--text-body)] text-[var(--bad)]"
            role="alert"
          >
            Could not load session approvals: {resource.error}
          </p>
          <Button
            className="!h-11 !min-h-11 justify-self-start"
            onClick={resource.reload}
            type="button"
            variant="outline"
          >
            Retry approvals
          </Button>
        </div>
      ) : null}
      {approvals.length ? (
        <section
          aria-label="Session approval requests"
          className="grid min-h-0 min-w-0 gap-1.5 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must scroll complete commands before making a decision.
          tabIndex={0}
        >
          {approvals.slice(0, 3).map((approval) => {
            const id = asString(approval.id);
            const isBusy = busyId === id;
            return (
              <article
                className="grid min-w-0 grid-cols-1 gap-2 border border-[var(--border)] bg-[var(--surface-raised)] p-2"
                key={id}
              >
                <div className="grid min-w-0 gap-[3px]">
                  <code className="whitespace-pre-wrap [overflow-wrap:anywhere] text-[length:var(--text-body)] text-[var(--text-soft)]">
                    {asString(approval.command, "Protected command")}
                  </code>
                  <p className="m-0 [overflow-wrap:anywhere] text-[length:var(--text-meta)] leading-relaxed text-[var(--muted)]">
                    {asString(
                      approval.reason,
                      "Doolittle requested permission before continuing.",
                    )}
                  </p>
                  <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
                    Expires {displayTimestamp(asString(approval.expiresAt))}
                  </small>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    className="!h-11 !min-h-11"
                    disabled={
                      Boolean(busyId) ||
                      decisionInFlight.current.has(id) ||
                      resource.loading ||
                      Boolean(resource.error)
                    }
                    onClick={() => void decide(approval, "approve")}
                    type="button"
                  >
                    {isBusy ? "Working…" : "Approve"}
                  </Button>
                  <Button
                    className="!h-11 !min-h-11"
                    disabled={
                      Boolean(busyId) ||
                      decisionInFlight.current.has(id) ||
                      resource.loading ||
                      Boolean(resource.error)
                    }
                    onClick={() => void decide(approval, "deny")}
                    type="button"
                    variant="outline"
                  >
                    Deny
                  </Button>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
      {approvals.length > 3 ? (
        <p className="m-0 text-[length:var(--text-meta)] text-[var(--muted)]">
          Showing 3 of {approvals.length}. All requests are available in Review.
        </p>
      ) : null}
      {feedback ? (
        <p
          aria-live={feedback.tone === "bad" ? "assertive" : "polite"}
          className={`m-0 [overflow-wrap:anywhere] text-[length:var(--text-meta)] leading-relaxed ${
            feedback.tone === "bad"
              ? "text-[var(--bad)]"
              : "text-[var(--accent-text)]"
          }`}
          role={feedback.tone === "bad" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </section>
  );
  if (!compact && !dialogOpen) return panel;
  return (
    <div data-session-approval-surface="disclosure" className="min-w-0">
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (open) dialogOpenerScope.current = scope.current;
          setOpenedScope(open ? scope.current : null);
        }}
      >
        <DialogTrigger asChild>
          <Button
            aria-label="Review session approvals"
            className="!h-11 !min-h-11 w-full justify-between gap-2"
            type="button"
            variant="outline"
            ref={triggerRef}
          >
            <span>Review session approvals</span>
            <span className="text-[length:var(--text-meta)] text-[var(--muted)]">
              {resource.loading
                ? "Checking…"
                : resource.error
                  ? "Unavailable"
                  : `${approvals.length} pending`}
            </span>
          </Button>
        </DialogTrigger>
        <DialogContent
          className="!gap-2 !rounded-[var(--radius-xs)] !border-[var(--border-strong)] !bg-[var(--surface)] !p-3 text-[var(--text)] motion-reduce:!animate-none"
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = triggerRef.current;
            if (
              mounted.current &&
              scope.current.active &&
              dialogOpenerScope.current === scope.current &&
              trigger?.isConnected &&
              !trigger.closest("[hidden], [inert]") &&
              trigger.getClientRects().length > 0
            )
              trigger.focus();
          }}
        >
          <DialogTitle className="text-[length:var(--text-body)]">
            Review session approvals
          </DialogTitle>
          <DialogDescription className="text-[length:var(--text-meta)] text-[var(--muted)]">
            Only requests bound to this session are shown. Closing review does
            not decide a request.
          </DialogDescription>
          {panel}
          <DialogClose asChild>
            <Button
              className="!h-11 !min-h-11 justify-self-end"
              type="button"
              variant="outline"
            >
              Close approvals
            </Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
    </div>
  );
}
