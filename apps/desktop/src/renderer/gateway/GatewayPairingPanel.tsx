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
      className="panel pairing-panel"
      aria-labelledby="pairing-title"
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary className="panel-heading gateway-heading">
        <div>
          <span className="eyebrow">Secure device access</span>
          <h2 id="pairing-title">Paired sender approvals</h2>
        </div>
        <span className="pairing-summary-counts">
          {open && loading
            ? "Loading…"
            : open
              ? `${pending.length} pending · ${approved.length} approved`
              : "Open to load"}
        </span>
      </summary>
      {open && loading ? (
        <LoadingBlock label="Loading paired sender approvals…" />
      ) : open && error ? (
        <ErrorBlock error={error} retry={onRetry} />
      ) : open ? (
        <div className="pairing-panel-body">
          <Notice announce="off" tone="neutral">
            <span>
              Messaging senders only—not remote desktop access. Requests expire
              under the Eliza runtime policy.
            </span>
          </Notice>
          {truncated ? (
            <Notice announce="off" tone="warn">
              Showing the newest 200 pairing records. Filter by platform through
              the API to inspect a narrower allowlist safely.
            </Notice>
          ) : null}
          <div className="pairing-columns">
            <section aria-labelledby="pairing-pending-title">
              <div className="pairing-section-heading">
                <div>
                  <span className="eyebrow">Pending</span>
                  <h3 id="pairing-pending-title">Awaiting approval</h3>
                </div>
                <Badge tone={pending.length ? "warn" : "neutral"}>
                  {pending.length}
                </Badge>
              </div>
              {!pending.length ? (
                <EmptyBlock title="No pending pairing requests">
                  New sender requests will appear here after Eliza receives
                  them.
                </EmptyBlock>
              ) : (
                <ul className="pairing-list">
                  {pending.map((request) => {
                    const approveId = `approve:${request.platform}:${request.code}`;
                    const denyId = `deny:${request.platform}:${request.code}`;
                    return (
                      <li key={request.id}>
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
                          <div className="pairing-actions">
                            <button
                              className="secondary-button"
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(approveId)}
                              type="button"
                            >
                              Approve
                            </button>
                            <button
                              className="secondary-button"
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(denyId)}
                              type="button"
                            >
                              Deny
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section aria-labelledby="pairing-approved-title">
              <div className="pairing-section-heading">
                <div>
                  <span className="eyebrow">Approved</span>
                  <h3 id="pairing-approved-title">Current allowlist</h3>
                </div>
                <Badge tone="good">{approved.length}</Badge>
              </div>
              {!approved.length ? (
                <EmptyBlock title="No approved senders">
                  Approvals remain in Eliza’s own allowlist and appear here when
                  the service exposes them.
                </EmptyBlock>
              ) : (
                <ul className="pairing-list">
                  {approved.map((sender) => {
                    const revokeId = `revoke:${sender.platform}:${sender.userId}`;
                    return (
                      <li key={sender.id}>
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
                          <div className="pairing-actions">
                            <button
                              className="secondary-button"
                              disabled={Boolean(actionId)}
                              onClick={() => onConfirmationChange(revokeId)}
                              type="button"
                            >
                              Revoke
                            </button>
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
