import { Button } from "@elizaos/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@elizaos/ui/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import type {
  ProviderAuthProvider,
  ProviderAuthState,
} from "../../shared/contracts";
import { UiIcon } from "../components/UiIcon";
import { asString, Badge } from "../lib";
import {
  PROVIDER_CONNECTION_ACTIONS_CLASS,
  PROVIDER_CONNECTION_COPY_CLASS,
  PROVIDER_CONNECTION_DEFAULT_CLASS,
  PROVIDER_CONNECTION_MENU_CLASS,
  PROVIDER_CONNECTION_MORE_CLASS,
  PROVIDER_CONNECTION_ROW_CLASS,
  PROVIDER_CONNECTION_TITLE_CLASS,
  PROVIDER_FACTS_CLASS,
  PROVIDER_IDENTITY_MARK_CLASS,
  PROVIDER_STATUS_LINE_CLASS,
} from "./layout";

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
  const statusClass = signingIn
    ? "is-pending [&>span]:animate-pulse [&>span]:bg-[var(--accent)] motion-reduce:[&>span]:animate-none"
    : fallbackReady
      ? "is-fallback [&>span]:bg-[var(--warn)]"
      : ready
        ? "is-ready [&>span]:bg-[var(--good)]"
        : "is-offline [&>span]:bg-[var(--muted)]";

  return (
    <article
      className={`${PROVIDER_CONNECTION_ROW_CLASS} ${isDefault ? PROVIDER_CONNECTION_DEFAULT_CLASS : ""}`}
      data-provider-connection="true"
    >
      <div className={PROVIDER_IDENTITY_MARK_CLASS} aria-hidden="true">
        {descriptor.shortLabel}
      </div>
      <div className={PROVIDER_CONNECTION_COPY_CLASS}>
        <div className={PROVIDER_CONNECTION_TITLE_CLASS}>
          <h3>{descriptor.label}</h3>
          <Badge tone={badgeTone}>{stateLabel}</Badge>
        </div>
        <div
          className={`${PROVIDER_STATUS_LINE_CLASS} ${statusClass}`}
          data-provider-status={
            signingIn
              ? "pending"
              : fallbackReady
                ? "fallback"
                : ready
                  ? "ready"
                  : "offline"
          }
          aria-live="polite"
        >
          <span aria-hidden="true" />
          <p title={detail}>{detail}</p>
        </div>
        <dl className={PROVIDER_FACTS_CLASS}>
          {facts.map((fact) => (
            <div key={fact.label} title={`${fact.label}: ${fact.value}`}>
              <dt className="sr-only">{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className={PROVIDER_CONNECTION_ACTIONS_CLASS}>
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
                className={PROVIDER_CONNECTION_MORE_CLASS}
                disabled={busy}
                size="icon-sm"
                title={`More actions for ${descriptor.label}`}
                type="button"
                variant="ghost"
              >
                <UiIcon icon={MoreHorizontal} size="sm" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className={PROVIDER_CONNECTION_MENU_CLASS}
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
