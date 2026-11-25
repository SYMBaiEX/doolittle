import { type ContextAction, ContextActionMenu } from "@doolittle/ui";
import { LogIn, MoreHorizontal, Plug, Route } from "lucide-react";
import type {
  ProviderAuthProvider,
  ProviderAuthState,
} from "../../shared/contracts";
import { WorkbenchAction } from "../components/workbench/Workbench";
import { asString, Badge } from "../lib";
import { ProviderIdentity } from "./ProviderIdentity";

export interface ProviderConnectionDescriptor {
  key: string;
  label: string;
  shortLabel: string;
  accountSignIn: boolean;
}

export function ProviderConnectionRow({
  authState,
  busy,
  descriptor,
  isDefault,
  onCancelSignIn,
  onConnect,
  onSetDefault,
  onSignIn,
  onSubmitCode,
  ready,
  status,
}: {
  authState?: ProviderAuthState;
  busy: boolean;
  descriptor: ProviderConnectionDescriptor;
  isDefault: boolean;
  onCancelSignIn: (provider: ProviderAuthProvider) => void;
  onConnect: () => void;
  onSetDefault: () => void;
  onSignIn: (provider: ProviderAuthProvider) => void;
  onSubmitCode: (provider: ProviderAuthProvider) => void;
  ready: boolean;
  status: Record<string, unknown>;
}) {
  const authProvider = descriptor.accountSignIn
    ? (descriptor.key as ProviderAuthProvider)
    : null;
  const signingIn =
    authState?.phase === "launching" || authState?.phase === "waiting";
  const nativeReady = Boolean(status.nativeReady) || Boolean(status.reusable);
  const fallbackReady = Boolean(status.fallbackReady) && !nativeReady;
  const unchecked = status.checked === false && !ready;
  const needsCodeSubmission =
    Boolean(authState?.needsCodeSubmission) && !authState?.codeSubmitted;
  const stateLabel = signingIn
    ? "Signing in"
    : nativeReady
      ? isDefault
        ? "In use"
        : "Ready"
      : fallbackReady
        ? "CLI fallback"
        : unchecked
          ? "Not checked"
          : "Needs sign-in";
  const runtimeLabel = nativeReady
    ? "Native"
    : fallbackReady
      ? "CLI fallback"
      : unchecked
        ? ""
        : "Offline";
  const detail = signingIn
    ? authState?.message || `Waiting for ${descriptor.label} sign-in…`
    : fallbackReady
      ? "CLI fallback is available; subscription sign-in needs attention."
      : asString(
          status.detail,
          authProvider
            ? `Use your ${descriptor.label} subscription; API keys remain optional.`
            : "No account details available.",
        );
  const facts = [
    { label: "Runtime", value: runtimeLabel },
    { label: "Account", value: asString(status.accountLabel) },
    { label: "Source", value: asString(status.source) },
  ].filter((fact) => fact.value);

  const primaryAction = signingIn
    ? needsCodeSubmission && authProvider
      ? {
          label: "Use copied code",
          onClick: () => onSubmitCode(authProvider),
          variant: undefined,
        }
      : authProvider
        ? {
            label: "Cancel",
            onClick: () => onCancelSignIn(authProvider),
            variant: "secondary" as const,
          }
        : null
    : ready
      ? {
          label: isDefault
            ? "In use"
            : fallbackReady
              ? "Use CLI fallback"
              : "Use for chats",
          onClick: onSetDefault,
          variant: "secondary" as const,
        }
      : authProvider
        ? {
            label: "Sign in",
            onClick: () => onSignIn(authProvider),
            variant: undefined,
          }
        : {
            label: "Connect",
            onClick: onConnect,
            variant: undefined,
          };
  const secondaryAction =
    authProvider && ready && !signingIn
      ? {
          label: fallbackReady ? "Repair sign-in" : "Add account",
          onClick: () => onSignIn(authProvider),
        }
      : authProvider && signingIn && needsCodeSubmission
        ? {
            label: "Cancel sign-in",
            onClick: () => onCancelSignIn(authProvider),
          }
        : null;
  const badgeTone =
    signingIn || unchecked || (nativeReady && !isDefault)
      ? "neutral"
      : nativeReady
        ? "good"
        : "warn";
  const usingProvider = ready && !signingIn && isDefault;
  const contextActions: ContextAction[] = [
    ...(primaryAction
      ? [
          {
            id: "primary",
            label: primaryAction.label,
            onSelect: primaryAction.onClick,
            disabled: busy || usingProvider,
          },
        ]
      : []),
    ...(secondaryAction
      ? [
          {
            id: "secondary",
            label: secondaryAction.label,
            onSelect: secondaryAction.onClick,
            disabled: busy,
          },
        ]
      : []),
  ];
  const menuScope = `provider:${descriptor.key}:${authState?.phase ?? "idle"}`;

  return (
    <ContextActionMenu
      label={`${descriptor.label} actions`}
      items={contextActions}
      scopeKey={menuScope}
    >
      <article
        className={`provider-connection-row${isDefault ? " is-default" : ""}`}
        data-provider-connection="true"
      >
        <ProviderIdentity initials={descriptor.shortLabel} />
        <div className="provider-connection-copy">
          <div className="provider-connection-title">
            <h3>{descriptor.label}</h3>
            <Badge tone={badgeTone}>{stateLabel}</Badge>
          </div>
          <div
            className="provider-connection-status-line"
            data-provider-status={
              signingIn
                ? "pending"
                : fallbackReady
                  ? "fallback"
                  : ready
                    ? "ready"
                    : unchecked
                      ? "unchecked"
                      : "offline"
            }
            aria-live="polite"
          >
            <p>{detail}</p>
          </div>
          {facts.length ? (
            <dl className="provider-connection-facts">
              {facts.map((fact) => (
                <div key={fact.label} title={`${fact.label}: ${fact.value}`}>
                  <dt className="sr-only">{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        <div className="provider-connection-actions">
          {primaryAction && !usingProvider ? (
            <WorkbenchAction
              onClick={primaryAction.onClick}
              disabled={busy}
              emphasis={
                primaryAction.variant !== "secondary" &&
                (isDefault || signingIn)
                  ? "primary"
                  : "secondary"
              }
              icon={
                signingIn
                  ? undefined
                  : ready
                    ? Route
                    : authProvider
                      ? LogIn
                      : Plug
              }
              size="sm"
              type="button"
            >
              {primaryAction.label}
            </WorkbenchAction>
          ) : null}
          {secondaryAction ? (
            <ContextActionMenu
              items={contextActions}
              label={`More actions for ${descriptor.label}`}
              scopeKey={menuScope}
              trigger={
                <WorkbenchAction
                  aria-label={`More actions for ${descriptor.label}`}
                  disabled={busy}
                  emphasis="quiet"
                  icon={MoreHorizontal}
                  size="icon-sm"
                  title={`More actions for ${descriptor.label}`}
                  type="button"
                />
              }
            >
              {null}
            </ContextActionMenu>
          ) : null}
        </div>
      </article>
    </ContextActionMenu>
  );
}
