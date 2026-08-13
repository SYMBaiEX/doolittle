import { Button } from "@elizaos/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@elizaos/ui/components/ui/dropdown-menu";
import type {
  ProviderAuthProvider,
  ProviderAuthState,
} from "../../shared/contracts";
import { asString, Badge } from "../lib";

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
        : "Needs sign-in";
  const runtimeLabel = nativeReady
    ? "Native"
    : fallbackReady
      ? "CLI fallback"
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
  const badgeTone = nativeReady ? (isDefault ? "good" : "neutral") : "warn";

  return (
    <article
      className={
        isDefault
          ? "provider-connection-row is-default"
          : "provider-connection-row"
      }
    >
      <div className="provider-identity-mark" aria-hidden="true">
        {descriptor.shortLabel}
      </div>
      <div className="provider-connection-copy">
        <div className="provider-connection-title">
          <h3>{descriptor.label}</h3>
          <Badge tone={badgeTone}>{stateLabel}</Badge>
        </div>
        <div
          className={`provider-connection-status-line ${signingIn ? "is-pending" : fallbackReady ? "is-fallback" : ready ? "is-ready" : "is-offline"}`}
          aria-live="polite"
        >
          <span aria-hidden="true" />
          <p title={detail}>{detail}</p>
        </div>
        <dl className="provider-connection-facts">
          {facts.map((fact) => (
            <div key={fact.label} title={`${fact.label}: ${fact.value}`}>
              <dt className="sr-only">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="provider-connection-actions">
        {primaryAction ? (
          <Button
            onClick={primaryAction.onClick}
            disabled={busy || (ready && !signingIn && isDefault)}
            size="sm"
            type="button"
            variant={primaryAction.variant}
          >
            {primaryAction.label}
          </Button>
        ) : null}
        {secondaryAction ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label={`More actions for ${descriptor.label}`}
                className="provider-connection-more"
                disabled={busy}
                size="icon-sm"
                title={`More actions for ${descriptor.label}`}
                type="button"
                variant="ghost"
              >
                <span aria-hidden="true">•••</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="provider-connection-menu"
            >
              <DropdownMenuItem
                onSelect={secondaryAction.onClick}
                disabled={busy}
              >
                {secondaryAction.label}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </article>
  );
}
