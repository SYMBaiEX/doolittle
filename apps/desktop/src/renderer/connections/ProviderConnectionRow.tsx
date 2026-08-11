import { Button } from "@elizaos/ui/components/ui/button";
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
  onRefresh,
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
  onRefresh: () => void;
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
          <Badge tone={isDefault ? "good" : ready ? "neutral" : "warn"}>
            {isDefault ? "Default" : ready ? "Ready" : "Needs setup"}
          </Badge>
        </div>
        <p>{asString(status.detail, "No account details available.")}</p>
        {authProvider ? (
          <div
            className={`provider-auth-inline ${signingIn ? "is-pending" : ""}`}
            aria-live="polite"
          >
            <span aria-hidden="true" />
            <small>
              {signingIn
                ? authState?.message
                : ready
                  ? `Authenticated through the official ${descriptor.label} client.`
                  : `Use your ${descriptor.label} subscription; API keys remain optional.`}
            </small>
          </div>
        ) : null}
      </div>
      <dl className="provider-connection-facts">
        <div>
          <dt>Source</dt>
          <dd>{asString(status.source, "Not detected")}</dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd>{asString(status.accountLabel, "Local credential")}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>
            {status.nativeReady ? "Native" : ready ? "Fallback" : "Offline"}
          </dd>
        </div>
      </dl>
      <div className="provider-connection-actions">
        {signingIn && authProvider ? (
          <Button
            onClick={() => onCancelSignIn(authProvider)}
            disabled={busy}
            type="button"
            variant="secondary"
          >
            Cancel
          </Button>
        ) : ready ? (
          <Button
            onClick={onSetDefault}
            disabled={busy || isDefault}
            type="button"
          >
            {isDefault ? "In use" : "Use for chats"}
          </Button>
        ) : authProvider ? (
          <Button
            onClick={() => onSignIn(authProvider)}
            disabled={busy}
            type="button"
          >
            Sign in
          </Button>
        ) : (
          <Button onClick={onConnect} disabled={busy} type="button">
            Connect
          </Button>
        )}
        <Button
          onClick={onRefresh}
          disabled={busy}
          type="button"
          variant="secondary"
        >
          Refresh
        </Button>
        {authProvider && ready && !signingIn ? (
          <Button
            onClick={() => onSignIn(authProvider)}
            disabled={busy}
            type="button"
            variant="ghost"
          >
            Add account
          </Button>
        ) : null}
        {authProvider &&
        signingIn &&
        authState?.needsCodeSubmission &&
        !authState.codeSubmitted ? (
          <Button
            onClick={() => onSubmitCode(authProvider)}
            disabled={busy}
            type="button"
          >
            Use copied code
          </Button>
        ) : null}
      </div>
    </article>
  );
}
