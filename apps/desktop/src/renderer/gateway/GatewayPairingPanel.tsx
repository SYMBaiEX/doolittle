import {
  Check,
  ChevronDown,
  Clock3,
  ShieldCheck,
  ShieldX,
  UserRound,
  X,
} from "lucide-react";
import { InlineActionConfirmation } from "../components/InlineActionConfirmation";
import { UiIcon } from "../components/UiIcon";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import type {
  GatewayApprovedSender,
  GatewayPairingRequest,
} from "../gateway-page-model";
import {
  Badge,
  displayTimestamp,
  ErrorBlock,
  LoadingBlock,
  Notice,
  titleCase,
} from "../lib";
import "../orchestration/work-surfaces.css";

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
      className="pairing-panel work-disclosure"
      onToggle={(event) => onOpenChange(event.currentTarget.open)}
    >
      <summary>
        <span className="work-disclosure__identity">
          <UiIcon icon={ShieldCheck} size="md" />
          <strong id="pairing-title">Sender approvals</strong>
        </span>
        <span className="work-disclosure__meta">
          {open && loading
            ? "Loading…"
            : open
              ? `${pending.length} pending · ${approved.length} approved`
              : "Messaging allowlist"}
          <UiIcon icon={ChevronDown} />
        </span>
      </summary>
      {open ? (
        <div className="work-pairing-body">
          {loading ? (
            <LoadingBlock label="Loading paired sender approvals…" />
          ) : error ? (
            <ErrorBlock error={error} retry={onRetry} />
          ) : (
            <>
              <p>
                Sender approval grants messaging access. Expiry follows runtime
                policy.
              </p>
              {truncated ? (
                <Notice announce="off" tone="warn">
                  Showing the newest 200 pairing records.
                </Notice>
              ) : null}
              <div className="work-pairing-grid">
                <WorkbenchSection
                  className="work-pairing-section"
                  headingLevel={3}
                  icon={Clock3}
                  title="Awaiting approval"
                  actions={
                    <Badge tone={pending.length ? "warn" : "neutral"}>
                      {pending.length}
                    </Badge>
                  }
                >
                  {!pending.length ? (
                    <WorkbenchEmpty title="No pending pairing requests">
                      New sender requests appear here when Eliza receives them.
                    </WorkbenchEmpty>
                  ) : (
                    <ul className="work-pairing-list">
                      {pending.map((request) => {
                        const approveId = `approve:${request.platform}:${request.code}`;
                        const denyId = `deny:${request.platform}:${request.code}`;
                        return (
                          <li className="work-pairing-row" key={request.id}>
                            <PairingIdentity
                              date={request.createdAt}
                              label="Requested"
                              platform={request.platform}
                              userId={request.userId}
                            />
                            <small className="work-pairing-code">
                              Code: <code>{request.code}</code>
                            </small>
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
                              <div className="work-pairing-actions">
                                <WorkbenchAction
                                  disabled={Boolean(actionId)}
                                  emphasis="primary"
                                  icon={Check}
                                  onClick={() =>
                                    onConfirmationChange(approveId)
                                  }
                                >
                                  Approve
                                </WorkbenchAction>
                                <WorkbenchAction
                                  disabled={Boolean(actionId)}
                                  emphasis="quiet"
                                  icon={X}
                                  onClick={() => onConfirmationChange(denyId)}
                                >
                                  Deny
                                </WorkbenchAction>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </WorkbenchSection>
                <WorkbenchSection
                  className="work-pairing-section"
                  headingLevel={3}
                  icon={ShieldCheck}
                  title="Current allowlist"
                  actions={<Badge tone="good">{approved.length}</Badge>}
                >
                  {!approved.length ? (
                    <WorkbenchEmpty title="No approved senders">
                      Senders appear here after their requests are approved.
                    </WorkbenchEmpty>
                  ) : (
                    <ul className="work-pairing-list">
                      {approved.map((sender) => {
                        const revokeId = `revoke:${sender.platform}:${sender.userId}`;
                        return (
                          <li className="work-pairing-row" key={sender.id}>
                            <PairingIdentity
                              date={sender.approvedAt}
                              label="Approved"
                              platform={sender.platform}
                              userId={sender.userId}
                            />
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
                              <div className="work-pairing-actions">
                                <WorkbenchAction
                                  disabled={Boolean(actionId)}
                                  emphasis="quiet"
                                  icon={ShieldX}
                                  onClick={() => onConfirmationChange(revokeId)}
                                >
                                  Revoke
                                </WorkbenchAction>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </WorkbenchSection>
              </div>
            </>
          )}
        </div>
      ) : null}
    </details>
  );
}

function PairingIdentity({
  date,
  label,
  platform,
  userId,
}: {
  date: string;
  label: string;
  platform: string;
  userId: string;
}) {
  return (
    <div className="work-pairing-row__identity">
      <span className="work-row-glyph">
        <UiIcon icon={UserRound} size="md" />
      </span>
      <div>
        <strong>{userId}</strong>
        <span>
          {titleCase(platform)}
          {" · "}
          <time dateTime={date}>
            {label} {displayTimestamp(date)}
          </time>
        </span>
      </div>
    </div>
  );
}
