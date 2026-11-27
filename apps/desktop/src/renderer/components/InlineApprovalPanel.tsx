import { Button } from "@doolittle/ui";
import { useVisibleInterval } from "@doolittle/ui/environment";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@elizaos/ui/components/ui/dialog";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import {
  approvalDecisionForShortcut,
  approvalShortcutAriaKey,
  approvalShortcutLabel,
} from "../approval-shortcuts";
import {
  APPROVAL_WAIT_REFRESH_MS,
  approvalWaitSnapshot,
} from "../approval-waiting";
import type { PendingSessionApproval } from "../chat/session-approvals";
import {
  type ActionFeedback,
  type ApiResource,
  asString,
  desktopRequest,
  displayTimestamp,
  errorMessage,
} from "../lib";

interface InlineApprovalPanelProps {
  active: boolean;
  approvals: readonly PendingSessionApproval[];
  botId: string;
  resource: Pick<ApiResource<unknown>, "error" | "loading" | "reload">;
  /** Use an explicit review dialog when the actual pane cannot fit inline actions. */
  compact?: boolean;
  /** Original chat room label, not the native runtime's hashed room UUID. */
  roomId: string;
}

interface ApprovalScope {
  active: boolean;
  botId: string;
  roomId: string;
}

export function InlineApprovalPanel({
  active: enabled,
  approvals,
  botId,
  compact = false,
  resource,
  roomId,
}: InlineApprovalPanelProps) {
  const scope = useRef<ApprovalScope>({ active: enabled, botId, roomId });
  if (
    scope.current.active !== enabled ||
    scope.current.botId !== botId ||
    scope.current.roomId !== roomId
  )
    scope.current = { active: enabled, botId, roomId };
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
  const currentIds = useRef(new Set<string>());
  currentIds.current = new Set(approvals.map((approval) => approval.id));
  const keyboardHintId = useId();
  const approveShortcut = approvalShortcutLabel("approve");
  const denyShortcut = approvalShortcutLabel("deny");
  const approvalIdsKey = approvals.map((approval) => approval.id).join("\n");
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (approvalIdsKey) setNowMs(Date.now());
  }, [approvalIdsKey]);
  useVisibleInterval(
    () => setNowMs(Date.now()),
    APPROVAL_WAIT_REFRESH_MS,
    enabled && approvals.length > 0,
  );

  const decide = async (
    approval: PendingSessionApproval,
    decision: "approve" | "deny",
  ) => {
    const { id } = approval;
    const decisionKey = JSON.stringify([botId, id]);
    if (
      !enabled ||
      !currentIds.current.has(id) ||
      busyId ||
      decisionInFlight.current.has(decisionKey) ||
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
    decisionInFlight.current.add(decisionKey);
    setBusy(pending);
    setResult(null);
    try {
      await desktopRequest(
        `/execution/approvals/${encodeURIComponent(id)}/${decision}`,
        "POST",
        {},
        undefined,
        undefined,
        submittedScope.botId,
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
      decisionInFlight.current.delete(decisionKey);
      if (mounted.current)
        setBusy((current) => (current === pending ? null : current));
    }
  };

  const decideFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented) return;
    const decision = approvalDecisionForShortcut(event.nativeEvent);
    if (!decision) return;
    const target = event.target;
    const approvalId =
      target instanceof HTMLElement
        ? target
            .closest<HTMLElement>("[data-session-approval-id]")
            ?.getAttribute("data-session-approval-id")
        : undefined;
    const approval = approvalId
      ? approvals.find((candidate) => candidate.id === approvalId)
      : target === event.currentTarget
        ? approvals[0]
        : undefined;
    if (!approval) return;
    event.preventDefault();
    event.stopPropagation();
    void decide(approval, decision);
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
        {approvals.length ? (
          <small
            className="text-[length:var(--text-meta)] text-[var(--faint)]"
            id={keyboardHintId}
          >
            Keyboard: focus this list, then {approveShortcut} approve ·{" "}
            {denyShortcut} deny.
          </small>
        ) : null}
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
          aria-describedby={keyboardHintId}
          aria-label="Session approval requests"
          className="grid min-h-0 min-w-0 gap-1.5 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          onKeyDown={decideFromKeyboard}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must scroll complete commands before making a decision.
          tabIndex={0}
        >
          {approvals.slice(0, 3).map((approval) => {
            const { id } = approval;
            const decisionKey = JSON.stringify([botId, id]);
            const isBusy = busyId === id;
            const wait = approvalWaitSnapshot(
              approval.createdAt,
              approval.expiresAt,
              nowMs,
            );
            return (
              <article
                className="grid min-w-0 grid-cols-1 gap-2 border border-[var(--border)] bg-[var(--surface-raised)] p-2"
                data-session-approval-id={id}
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
                  <small
                    className={`text-[length:var(--text-meta)] ${
                      wait?.tone === "stale"
                        ? "font-medium text-[var(--warn)]"
                        : "text-[var(--muted)]"
                    }`}
                    title={`Requested ${displayTimestamp(asString(approval.createdAt))} · expires ${displayTimestamp(asString(approval.expiresAt))}`}
                  >
                    {wait
                      ? `${wait.waitingText}${wait.expiryText ? ` · ${wait.expiryText}` : ""}`
                      : `Expires ${displayTimestamp(asString(approval.expiresAt))}`}
                  </small>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    aria-keyshortcuts={approvalShortcutAriaKey("approve")}
                    className="!h-11 !min-h-11"
                    disabled={
                      Boolean(busyId) ||
                      decisionInFlight.current.has(decisionKey) ||
                      resource.loading ||
                      Boolean(resource.error)
                    }
                    onClick={() => void decide(approval, "approve")}
                    type="button"
                  >
                    {isBusy ? "Working…" : "Approve"}
                  </Button>
                  <Button
                    aria-keyshortcuts={approvalShortcutAriaKey("deny")}
                    className="!h-11 !min-h-11"
                    disabled={
                      Boolean(busyId) ||
                      decisionInFlight.current.has(decisionKey) ||
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
    <div data-session-approval-surface="disclosure" className="mb-2 min-w-0">
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
