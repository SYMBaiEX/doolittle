import { Button } from "@elizaos/ui/components/ui/button";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import type {
  GatewayApprovedSender,
  GatewayPairingRequest,
} from "../gateway-page-model";
import {
  Badge,
  displayTimestamp,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Notice,
  titleCase,
} from "../lib";
import {
  GATEWAY_DISCLOSURE_SUMMARY_CLASS,
  GATEWAY_LIST_CLASS,
  GATEWAY_META_CLASS,
} from "./gateway-layout";

type PairingMutation = (
  action: "approve" | "deny" | "revoke",
  input: { platform: string; code?: string; userId?: string },
) => void;

export function GatewayPairingPanel({
  actionId,
  approved,
  confirmationId,
  error,
  loading,
  onConfirmationChange,
  onOpenChange,
  onRetry,
  onUpdate,
  open,
  pending,
  truncated,
}: {
  actionId: string;
  approved: GatewayApprovedSender[];
  confirmationId: string;
  error: string;
  loading: boolean;
  onConfirmationChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRetry: () => void;
  onUpdate: PairingMutation;
  open: boolean;
  pending: GatewayPairingRequest[];
  truncated: boolean;
}) {
  return (
    <details
      aria-labelledby="pairing-title"
      className="pairing-panel group panel grid gap-2.5"
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary
        className={`${GATEWAY_DISCLOSURE_SUMMARY_CLASS} group-open:border-[var(--border)] group-open:border-b`}
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <strong className="text-sm" id="pairing-title">
            Sender approvals
          </strong>
          <small className={GATEWAY_META_CLASS}>Messaging allowlist</small>
        </span>
        <span
          className={`${GATEWAY_META_CLASS} ml-auto uppercase after:absolute after:right-3 after:content-['+'] group-open:after:content-['−']`}
        >
          {open && loading
            ? "Loading…"
            : open
              ? `${pending.length} pending · ${approved.length} approved`
              : "Load approvals"}
        </span>
      </summary>
      {open && loading ? (
        <LoadingBlock label="Loading paired sender approvals…" />
      ) : open && error ? (
        <ErrorBlock error={error} retry={onRetry} />
      ) : open ? (
        <div className="grid gap-2.25 px-3 pb-3">
          <p className={`m-0 ${GATEWAY_META_CLASS}`}>
            Messaging allowlist only · no remote desktop access · expiry follows
            runtime policy
          </p>
          {truncated ? (
            <Notice announce="off" tone="warn">
              Showing the newest 200 pairing records. Filter by platform through
              the API to inspect a narrower allowlist safely.
            </Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3.5 max-[1060px]:grid-cols-1">
            <section aria-labelledby="pairing-pending-title">
              <div className="flex items-start justify-between gap-3 border-[var(--border)] border-b pb-1.75">
                <div>
                  <span className="eyebrow">Pending</span>
                  <h3
                    className="mt-0.75 mb-0 text-sm"
                    id="pairing-pending-title"
                  >
                    Awaiting approval
                  </h3>
                </div>
                <Badge tone={pending.length ? "warn" : "neutral"}>
                  {pending.length}
                </Badge>
              </div>
              {!pending.length ? (
                <EmptyBlock
                  density="compact"
                  title="No pending pairing requests"
                >
                  New sender requests will appear here after Eliza receives
                  them.
                </EmptyBlock>
              ) : (
                <ul className={GATEWAY_LIST_CLASS}>
                  {pending.map((request) => {
                    const approveId = `approve:${request.platform}:${request.code}`;
                    const denyId = `deny:${request.platform}:${request.code}`;
                    return (
                      <li
                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.25 gap-y-1.25 border-[var(--border)] border-b py-2.25 [&>span]:col-span-full [&>span]:font-mono [&>span]:text-[10px] [&>span]:text-[var(--muted)] [&>time]:col-span-full [&>time]:font-mono [&>time]:text-[10px] [&>time]:text-[var(--muted)]"
                        key={request.id}
                      >
                        <Badge tone="warn">{titleCase(request.platform)}</Badge>
                        <strong>{request.userId}</strong>
                        <span>Code: {request.code}</span>
                        <time dateTime={request.createdAt}>
                          Requested {displayTimestamp(request.createdAt)}
                        </time>
                        {confirmationId === approveId ? (
                          <InlineActionConfirmation
                            busy={actionId === approveId}
                            busyLabel="Approving…"
                            confirmLabel="Confirm approve"
                            detail={`Allows future ${request.platform} messages from this sender.`}
                            onCancel={() => onConfirmationChange("")}
                            onConfirm={() => onUpdate("approve", request)}
                            title={`Approve ${request.userId}?`}
                            tone="primary"
                          />
                        ) : confirmationId === denyId ? (
                          <InlineActionConfirmation
                            busy={actionId === denyId}
                            busyLabel="Denying…"
                            confirmLabel="Confirm deny"
                            detail="Removes this request without adding the sender to Eliza’s allowlist."
                            onCancel={() => onConfirmationChange("")}
                            onConfirm={() => onUpdate("deny", request)}
                            title={`Deny ${request.userId}?`}
                          />
                        ) : (
                          <div className="col-span-full flex flex-wrap gap-1.75 pt-0.75">
                            <Button
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(approveId)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Approve
                            </Button>
                            <Button
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(denyId)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Deny
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="pairing-approved-title">
              <div className="flex items-start justify-between gap-3 border-[var(--border)] border-b pb-1.75">
                <div>
                  <span className="eyebrow">Approved</span>
                  <h3
                    className="mt-0.75 mb-0 text-sm"
                    id="pairing-approved-title"
                  >
                    Current allowlist
                  </h3>
                </div>
                <Badge tone="good">{approved.length}</Badge>
              </div>
              {!approved.length ? (
                <EmptyBlock density="compact" title="No approved senders">
                  Approvals remain in Eliza’s own allowlist and appear here when
                  the service exposes them.
                </EmptyBlock>
              ) : (
                <ul className={GATEWAY_LIST_CLASS}>
                  {approved.map((sender) => {
                    const revokeId = `revoke:${sender.platform}:${sender.userId}`;
                    return (
                      <li
                        className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.25 gap-y-1.25 border-[var(--border)] border-b py-2.25 [&>time]:col-span-full [&>time]:font-mono [&>time]:text-[10px] [&>time]:text-[var(--muted)]"
                        key={sender.id}
                      >
                        <Badge tone="good">{titleCase(sender.platform)}</Badge>
                        <strong>{sender.userId}</strong>
                        <time dateTime={sender.approvedAt}>
                          Approved {displayTimestamp(sender.approvedAt)}
                        </time>
                        {confirmationId === revokeId ? (
                          <InlineActionConfirmation
                            busy={actionId === revokeId}
                            busyLabel="Revoking…"
                            confirmLabel="Confirm revoke"
                            detail={`Blocks future ${sender.platform} messages until this sender pairs again.`}
                            onCancel={() => onConfirmationChange("")}
                            onConfirm={() => onUpdate("revoke", sender)}
                            title={`Revoke ${sender.userId}?`}
                          />
                        ) : (
                          <div className="col-span-full flex flex-wrap gap-1.75 pt-0.75">
                            <Button
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(revokeId)}
                              size="sm"
                              type="button"
                              variant="secondary"
                            >
                              Revoke
                            </Button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </details>
  );
}
