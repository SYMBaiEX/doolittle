import type { BotSummary, CreateBotInput } from "@doolittle/contracts/bots";
import { Button, Input, Textarea } from "@doolittle/ui";
import { useEffect, useId, useRef, useState } from "react";
import type {
  AccountPoolResponse,
  RuntimeStatus,
} from "../../shared/contracts";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";
import { desktopRequest, errorMessage } from "../lib";

const STEP_LABELS = [
  "Identity",
  "Persona",
  "Model",
  "Access",
  "Review",
] as const;

export interface BotCreationDialogProps {
  editingBot?: BotSummary;
  onClose: () => void;
  onCreated: (bot: BotSummary) => void;
  returnFocusTarget: HTMLElement | null;
  runtime: RuntimeStatus | null;
  workspacePath: string;
  projectId?: string;
}

export function BotCreationDialog({
  editingBot,
  onClose,
  onCreated,
  returnFocusTarget,
  runtime,
  workspacePath,
  projectId,
}: BotCreationDialogProps) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(editingBot?.name ?? "");
  const [avatar, setAvatar] = useState(editingBot?.avatar ?? "");
  const [persona, setPersona] = useState(editingBot?.persona ?? "");
  const [provider, setProvider] = useState(
    editingBot?.model.provider ?? runtime?.provider ?? "",
  );
  const [model, setModel] = useState(
    editingBot?.model.model ?? runtime?.model ?? "",
  );
  const [botWorkspacePath, setBotWorkspacePath] = useState(
    editingBot?.workspacePath ?? workspacePath,
  );
  const [allowMutation, setAllowMutation] = useState(
    editingBot?.permissions.allowMutation ?? false,
  );
  const [allowDelegation, setAllowDelegation] = useState(
    editingBot?.permissions.allowDelegation ?? false,
  );
  const [connectionIds, setConnectionIds] = useState<string[]>(
    editingBot?.permissions.connectionIds ?? [],
  );
  const [accountPool, setAccountPool] = useState<AccountPoolResponse | null>(
    null,
  );
  const [accountError, setAccountError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const dialogRef = useModalFocusBoundary({
    active: true,
    initialFocusSelector: "[data-dialog-initial-focus]",
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose: () => {
      if (!saving) onClose();
    },
    restoreFocus: true,
    restoreFocusTarget: returnFocusTarget,
  });
  useEffect(() => {
    let disposed = false;
    void desktopRequest<AccountPoolResponse>("/runtime/account-pool")
      .then((response) => {
        if (!disposed) setAccountPool(response);
      })
      .catch((cause) => {
        if (!disposed) setAccountError(errorMessage(cause));
      });
    return () => {
      disposed = true;
    };
  }, []);
  const accountOptions = Object.entries(accountPool?.providers ?? {}).flatMap(
    ([providerId, snapshot]) =>
      (snapshot?.accounts ?? []).map((account) => ({
        id: `${providerId}:${account.accountId}`,
        label: `${providerId} · ${account.label}`,
        enabled: account.enabled,
      })),
  );

  const validation =
    step === 0 && !name.trim()
      ? "Give this bot a name."
      : step === 1 && !persona.trim()
        ? "Describe what this bot should do."
        : step === 2 && (!provider.trim() || !model.trim())
          ? "Choose a provider and model."
          : "";

  const submit = async () => {
    setError("");
    if (validation) {
      setError(validation);
      const invalidField =
        step === 0
          ? "bot-create-name"
          : step === 1
            ? "bot-create-persona"
            : step === 2
              ? !provider.trim()
                ? "bot-create-provider"
                : "bot-create-model"
              : null;
      if (invalidField) document.getElementById(invalidField)?.focus();
      return;
    }
    if (step < STEP_LABELS.length - 1) {
      setStep((current) => current + 1);
      return;
    }
    const input: CreateBotInput = {
      name: name.trim(),
      persona: persona.trim(),
      ...(avatar ? { avatar } : {}),
      model: {
        provider: provider.trim(),
        model: model.trim(),
        ...(editingBot?.model.reasoningEffort &&
        editingBot.model.provider === provider.trim() &&
        editingBot.model.model === model.trim()
          ? { reasoningEffort: editingBot.model.reasoningEffort }
          : {}),
      },
      workspacePath: botWorkspacePath.trim(),
      ...((editingBot ? editingBot.projectId : projectId)
        ? { projectId: editingBot ? editingBot.projectId : projectId }
        : {}),
      permissions: {
        connectionIds,
        workspacePaths: [
          ...new Set([
            ...(editingBot?.permissions.workspacePaths.filter(
              (path) => path !== editingBot.workspacePath,
            ) ?? []),
            ...(botWorkspacePath.trim() ? [botWorkspacePath.trim()] : []),
          ]),
        ],
        toolIds: editingBot?.permissions.toolIds ?? [],
        allowMutation,
        allowDelegation,
      },
    };
    setSaving(true);
    try {
      const created = await desktopRequest<BotSummary>(
        editingBot ? `/bots/${encodeURIComponent(editingBot.id)}` : "/bots",
        editingBot ? "PATCH" : "POST",
        input,
      );
      onCreated(created);
    } catch (cause) {
      setError(errorMessage(cause) || "Could not create this bot. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const validationVisible = Boolean(error && validation);
  const validationId = "bot-create-validation";

  return (
    <div
      className="fixed inset-0 z-120 grid place-items-center bg-[color-mix(in_srgb,var(--shadow)_40%,transparent)] p-4"
      ref={backdropRef}
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="w-[min(100%,520px)] rounded-[var(--radius-xl)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-5 text-[var(--text)] shadow-[var(--shell-shadow-lg)]"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-lg font-semibold" id={titleId}>
              {editingBot ? `Edit ${editingBot.name}` : "Add a bot"}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {STEP_LABELS[step]} · {step + 1} of {STEP_LABELS.length}
            </p>
          </div>
          <Button
            aria-label={editingBot ? "Close edit bot" : "Close add bot"}
            disabled={saving}
            onClick={onClose}
            type="button"
            variant="ghost"
          >
            Close
          </Button>
        </header>
        <div className="grid min-h-48 content-start gap-4">
          {step === 0 ? (
            <>
              <label className="grid gap-1.5 text-sm" htmlFor="bot-create-name">
                Name
                <Input
                  data-dialog-initial-focus
                  aria-invalid={
                    validationVisible && step === 0 && !name.trim()
                      ? true
                      : undefined
                  }
                  aria-describedby={
                    validationVisible && step === 0 && !name.trim()
                      ? validationId
                      : undefined
                  }
                  id="bot-create-name"
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label
                className="grid gap-1.5 text-sm"
                htmlFor="bot-create-avatar"
              >
                Avatar key{" "}
                <span className="text-xs text-[var(--muted)]">
                  Optional local icon key
                </span>
                <Input
                  id="bot-create-avatar"
                  maxLength={40}
                  onChange={(event) => setAvatar(event.target.value)}
                  value={avatar}
                />
              </label>
            </>
          ) : step === 1 ? (
            <label
              className="grid gap-1.5 text-sm"
              htmlFor="bot-create-persona"
            >
              Purpose and working style
              <Textarea
                autoFocus
                aria-invalid={
                  validationVisible && step === 1 && !persona.trim()
                    ? true
                    : undefined
                }
                aria-describedby={
                  validationVisible && step === 1 && !persona.trim()
                    ? validationId
                    : undefined
                }
                id="bot-create-persona"
                maxLength={4000}
                onChange={(event) => setPersona(event.target.value)}
                rows={5}
                value={persona}
              />
            </label>
          ) : step === 2 ? (
            <>
              <label
                className="grid gap-1.5 text-sm"
                htmlFor="bot-create-provider"
              >
                Provider
                <Input
                  autoFocus
                  aria-invalid={
                    validationVisible && step === 2 && !provider.trim()
                      ? true
                      : undefined
                  }
                  aria-describedby={
                    validationVisible && step === 2 && !provider.trim()
                      ? validationId
                      : undefined
                  }
                  id="bot-create-provider"
                  onChange={(event) => setProvider(event.target.value)}
                  value={provider}
                />
              </label>
              <label
                className="grid gap-1.5 text-sm"
                htmlFor="bot-create-model"
              >
                Model
                <Input
                  aria-invalid={
                    validationVisible && step === 2 && !model.trim()
                      ? true
                      : undefined
                  }
                  aria-describedby={
                    validationVisible && step === 2 && !model.trim()
                      ? validationId
                      : undefined
                  }
                  id="bot-create-model"
                  onChange={(event) => setModel(event.target.value)}
                  value={model}
                />
              </label>
              <p className="m-0 text-xs text-[var(--muted)]">
                Use a configured provider and model. Account setup stays in
                Connections.
              </p>
            </>
          ) : step === 3 ? (
            <>
              <label
                className="grid gap-1.5 text-sm"
                htmlFor="bot-create-workspace"
              >
                Workspace path
                <Input
                  autoFocus
                  id="bot-create-workspace"
                  onChange={(event) => setBotWorkspacePath(event.target.value)}
                  value={botWorkspacePath}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={allowMutation}
                  onChange={(event) => setAllowMutation(event.target.checked)}
                  type="checkbox"
                />
                Allow file and tool changes
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  checked={allowDelegation}
                  onChange={(event) => setAllowDelegation(event.target.checked)}
                  type="checkbox"
                />
                Allow delegation
              </label>
              <fieldset className="grid gap-2 border-t border-[var(--border)] pt-3">
                <legend className="text-sm">Connected accounts</legend>
                {accountOptions.length ? (
                  accountOptions.map((account) => (
                    <label
                      className="flex items-center gap-2 text-sm"
                      key={account.id}
                    >
                      <input
                        checked={connectionIds.includes(account.id)}
                        disabled={!account.enabled}
                        onChange={(event) =>
                          setConnectionIds((current) =>
                            event.target.checked
                              ? [...current, account.id]
                              : current.filter((id) => id !== account.id),
                          )
                        }
                        type="checkbox"
                      />
                      {account.label}
                      {account.enabled ? "" : " · disabled"}
                    </label>
                  ))
                ) : (
                  <p className="m-0 text-xs text-[var(--muted)]">
                    {accountError
                      ? "Accounts unavailable. This bot will be saved stopped."
                      : accountPool
                        ? "No accounts connected. This bot will be saved stopped."
                        : "Checking connected accounts…"}
                  </p>
                )}
              </fieldset>
              <p className="m-0 text-xs text-[var(--muted)]">
                Only selected accounts are granted. No credentials are copied
                into this bot.
              </p>
            </>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-[var(--muted)]">Name</dt>
              <dd className="m-0">{name}</dd>
              <dt className="text-[var(--muted)]">Purpose</dt>
              <dd className="m-0 whitespace-pre-wrap">{persona}</dd>
              <dt className="text-[var(--muted)]">Model</dt>
              <dd className="m-0">
                {provider} / {model}
              </dd>
              <dt className="text-[var(--muted)]">Workspace</dt>
              <dd className="m-0 break-all">{botWorkspacePath || "None"}</dd>
              <dt className="text-[var(--muted)]">Access</dt>
              <dd className="m-0">
                {allowMutation ? "Changes allowed" : "Read only"} ·{" "}
                {allowDelegation ? "Delegation allowed" : "No delegation"}
              </dd>
              <dt className="text-[var(--muted)]">Accounts</dt>
              <dd className="m-0">
                {connectionIds.length
                  ? `${connectionIds.length} selected`
                  : "None — bot remains stopped until connected"}
              </dd>
            </dl>
          )}
        </div>
        {error ? (
          <p
            className="mt-3 text-sm text-[var(--bad)]"
            id={validationVisible ? validationId : undefined}
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <footer className="mt-5 flex justify-end gap-2">
          {step > 0 ? (
            <Button
              disabled={saving}
              onClick={() => {
                setError("");
                setStep((current) => current - 1);
              }}
              type="button"
              variant="ghost"
            >
              Back
            </Button>
          ) : null}
          <Button
            aria-busy={saving}
            disabled={saving}
            onClick={() => void submit()}
            type="button"
          >
            {saving
              ? "Saving…"
              : step === STEP_LABELS.length - 1
                ? editingBot
                  ? "Save bot"
                  : "Create bot"
                : "Continue"}
          </Button>
        </footer>
      </section>
    </div>
  );
}
