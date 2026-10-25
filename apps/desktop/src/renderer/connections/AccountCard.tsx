import type { AccountWithCredentialFlag } from "@elizaos/ui/api/client-agent";
import { Button } from "@elizaos/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@elizaos/ui/components/ui/dialog";
import { Input } from "@elizaos/ui/components/ui/input";
import { useState } from "react";
import { Badge } from "../lib";

type AccountCardProps = {
  account: AccountWithCredentialFlag;
  isFirst: boolean;
  isLast: boolean;
  saving: boolean;
  onPatch: (
    changes: Partial<{ label: string; enabled: boolean; priority: number }>,
  ) => Promise<void>;
  onMoveUp: () => Promise<void>;
  onMoveDown: () => Promise<void>;
  onTest: () => Promise<void>;
  onRefreshUsage: () => Promise<void>;
  onDelete: () => Promise<void>;
  testBusy?: boolean;
  refreshBusy?: boolean;
};

function Usage({
  label,
  value,
  resetsAt,
}: {
  label: string;
  value?: number;
  resetsAt?: number;
}) {
  const percentage =
    value != null && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : undefined;
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
      <span>{label}</span>
      <progress
        aria-label={`${label} usage`}
        max={100}
        value={percentage ?? 0}
        className="h-1.5 w-24"
      />
      <span>
        {percentage == null ? "Unknown" : `${Math.round(percentage)}%`}
      </span>
      {resetsAt ? (
        <span>Resets {new Date(resetsAt).toLocaleString()}</span>
      ) : null}
    </div>
  );
}

/** Client presentation only: credentials, health, routing and mutations stay in ElizaOS. */
export function AccountCard({
  account,
  isFirst,
  isLast,
  saving,
  onPatch,
  onMoveUp,
  onMoveDown,
  onTest,
  onRefreshUsage,
  onDelete,
  testBusy = false,
  refreshBusy = false,
}: AccountCardProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(account.label);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const disabled = saving || pending;
  async function run(action: () => Promise<void>) {
    setPending(true);
    setError("");
    try {
      await action();
      return true;
    } catch {
      setError("Account update failed. Try again.");
      return false;
    } finally {
      setPending(false);
    }
  }
  const healthLabel =
    {
      ok: "Healthy",
      "rate-limited": "Rate-limited",
      "needs-reauth": "Needs reauth",
      invalid: "Invalid credential",
      unknown: "Unknown",
    }[account.health] ?? "Unknown";
  return (
    <div
      className={`flex flex-col gap-2 rounded-sm border border-[var(--border)] p-3 ${account.enabled ? "" : "opacity-60"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={account.health === "ok" ? "good" : "warn"}>
          {healthLabel}
        </Badge>
        {account.health === "rate-limited" && account.healthDetail?.until ? (
          <small>
            Resets {new Date(account.healthDetail.until).toLocaleString()}
          </small>
        ) : null}
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const next = label.trim();
              if (next)
                void run(() => onPatch({ label: next })).then((ok) => {
                  if (ok) setEditing(false);
                });
            }}
          >
            <Input
              aria-label="Account label"
              value={label}
              disabled={disabled}
              onChange={(event) => setLabel(event.target.value)}
            />
            <Button type="submit" disabled={disabled || !label.trim()}>
              Save label
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            title="Click to rename"
            onClick={() => {
              setLabel(account.label);
              setEditing(true);
            }}
          >
            {account.label}
          </Button>
        )}
        <small>
          {account.providerId === "zai-coding" ||
          account.providerId === "kimi-coding"
            ? "Coding plan"
            : account.source === "oauth"
              ? "OAuth"
              : "API key"}{" "}
          · #{account.priority}
        </small>
        <small>
          Last used{" "}
          {account.lastUsedAt
            ? new Date(account.lastUsedAt).toLocaleString()
            : "Never"}
        </small>
        <Button
          type="button"
          variant="ghost"
          aria-label="Move up"
          disabled={disabled || isFirst}
          onClick={() => void run(onMoveUp)}
        >
          ↑
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-label="Move down"
          disabled={disabled || isLast}
          onClick={() => void run(onMoveDown)}
        >
          ↓
        </Button>
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            aria-label="Account enabled"
            checked={account.enabled}
            disabled={disabled}
            onChange={(event) => {
              const enabled = event.currentTarget.checked;
              void run(() => onPatch({ enabled }));
            }}
          />
          Enabled
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || testBusy}
          onClick={() => void run(onTest)}
        >
          {testBusy ? "Testing…" : "Test"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || refreshBusy}
          onClick={() => void run(onRefreshUsage)}
        >
          {refreshBusy ? "Refreshing…" : "Refresh"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setError("");
            setConfirmingDelete(true);
          }}
        >
          Delete account
        </Button>
      </div>
      {account.usage ||
      account.providerId === "anthropic-subscription" ||
      account.providerId === "openai-codex" ? (
        <div className="flex flex-wrap gap-4">
          <Usage
            label="Session"
            value={account.usage?.sessionPct}
            resetsAt={account.usage?.resetsAt}
          />
          {account.providerId === "anthropic-subscription" ? (
            <Usage
              label="Weekly"
              value={account.usage?.weeklyPct}
              resetsAt={account.usage?.resetsAt}
            />
          ) : null}
        </div>
      ) : (
        <small>No usage data yet. Refresh to check.</small>
      )}
      {!account.hasCredential ? (
        <small>Orphan metadata: no local credential found.</small>
      ) : null}
      {error && !confirmingDelete ? <p role="alert">{error}</p> : null}
      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!pending) setConfirmingDelete(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete account?</DialogTitle>
            <DialogDescription>
              Remove {account.label} and its stored credential from the local
              Eliza account pool. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error ? <p role="alert">{error}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirmingDelete(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={disabled}
              onClick={() =>
                void run(onDelete).then((ok) => {
                  if (ok) setConfirmingDelete(false);
                })
              }
            >
              {pending ? "Deleting…" : "Confirm delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
