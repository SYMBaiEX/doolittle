import type { BotSummary, CreateBotInput } from "@doolittle/contracts/bots";
import { ArrowLeft, ArrowUp, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type {
  AccountPoolResponse,
  RuntimeStatus,
} from "../../shared/contracts";
import { desktopRequest, errorMessage } from "../lib";
import { botCharacterDraft } from "./bot-character-draft";

const questions = [
  "What would you like your bot to help with?",
  "How should it work with you?",
  "What should we call it?",
] as const;
const suggestions = [
  ["Code and GitHub", "Research and writing", "Planning and daily briefings"],
  [
    "Clear and direct. Explain decisions and verify results.",
    "Thoughtful and thorough. Ask when an important detail is missing.",
    "Warm and collaborative. Keep updates short and practical.",
  ],
  [],
] as const;

export function BotCreationConversation({
  onClose,
  onCreated,
  onDirtyChange,
  runtime,
  workspacePath,
  projectId,
}: {
  onClose: () => void;
  onCreated: (bot: BotSummary) => void;
  onDirtyChange?: (dirty: boolean) => void;
  runtime: RuntimeStatus | null;
  workspacePath: string;
  projectId?: string;
}) {
  const [answers, setAnswers] = useState<string[]>([]);
  const [answer, setAnswer] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [provider, setProvider] = useState(runtime?.provider ?? "");
  const [model, setModel] = useState(runtime?.model ?? "");
  const [botWorkspace, setBotWorkspace] = useState(workspacePath);
  const [connectionIds, setConnectionIds] = useState<string[]>([]);
  const [allowMutation, setAllowMutation] = useState(false);
  const [allowDelegation, setAllowDelegation] = useState(false);
  const [accountPool, setAccountPool] = useState<AccountPoolResponse | null>(
    null,
  );
  const [accountError, setAccountError] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const questionId = useId();
  const errorId = useId();
  const step = answers.length;
  const purpose = answers[0] ?? "";
  const style = answers[1] ?? "";
  const name = answers[2] ?? "New bot";
  const character = botCharacterDraft(purpose, style);
  const dirty = Boolean(answer.trim() || answers.length > 0);
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  const accountOptions = Object.entries(accountPool?.providers ?? {}).flatMap(
    ([providerId, snapshot]) =>
      (snapshot?.accounts ?? []).map((account) => ({
        id: `${providerId}:${account.accountId}`,
        label: `${providerId} · ${account.label}`,
        enabled: account.enabled,
      })),
  );

  useEffect(() => {
    let disposed = false;
    void desktopRequest<AccountPoolResponse>("/runtime/account-pool")
      .then((pool) => {
        if (!disposed) setAccountPool(pool);
      })
      .catch(() => {
        if (!disposed) setAccountError(true);
      });
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (step < questions.length)
        inputRef.current?.focus({ preventScroll: true });
      else if (reviewing || step === questions.length)
        questionRef.current?.focus({ preventScroll: true });
    });
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
    return () => cancelAnimationFrame(frame);
  }, [step, reviewing]);

  const reply = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Type an answer or choose a suggestion.");
      inputRef.current?.focus();
      return;
    }
    setError("");
    setAnswers((current) => [...current, trimmed]);
    setAnswer("");
  };
  const save = async () => {
    if (savingRef.current) return;
    if (!provider.trim() || !model.trim()) {
      setError("Choose a provider and model before creating your bot.");
      return;
    }
    const availableConnections = new Set(
      accountOptions
        .filter((account) => account.enabled)
        .map((account) => account.id),
    );
    if (connectionIds.some((id) => !availableConnections.has(id))) {
      setError(
        "An account is no longer available. Review the selected accounts.",
      );
      return;
    }
    const input: CreateBotInput = {
      name,
      character,
      model: { provider: provider.trim(), model: model.trim() },
      workspacePath: botWorkspace.trim(),
      ...(projectId ? { projectId } : {}),
      permissions: {
        connectionIds,
        workspacePaths: botWorkspace.trim() ? [botWorkspace.trim()] : [],
        toolIds: [],
        allowMutation,
        allowDelegation,
      },
    };
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      onCreated(await desktopRequest<BotSummary>("/bots", "POST", input));
    } catch (cause) {
      setError(
        errorMessage(cause) ||
          "Could not save your bot. Your draft is still here.",
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-label="Create a new bot" className="bot-design-conversation">
      <header className="bot-design-header">
        <span aria-hidden className="new-chat-avatar">
          {name.slice(0, 1)}
        </span>
        <strong>{name}</strong>
        <button
          aria-label="Cancel bot creation"
          className="bot-design-icon"
          disabled={saving}
          onClick={onClose}
          type="button"
        >
          <X aria-hidden size={18} />
        </button>
      </header>
      <div className="bot-design-thread" ref={threadRef}>
        <div className="bot-design-reading">
          <p className="bot-design-greeting">
            Let’s design a bot for you. We’ll shape its purpose and working
            style, then review its Eliza character and access before saving.
          </p>
          {answers.map((value, index) => (
            <div className="bot-design-turn" key={questions[index]}>
              <p className="bot-design-question">{questions[index]}</p>
              <p className="bot-design-answer">{value}</p>
            </div>
          ))}
          {step < questions.length ? (
            <section
              aria-labelledby={questionId}
              className="bot-design-question-block"
            >
              <h2 id={questionId}>{questions[step]}</h2>
              <div className="bot-design-suggestions">
                {suggestions[step]?.map((value) => (
                  <button
                    key={value}
                    onClick={() => reply(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>
          ) : !reviewing ? (
            <section
              aria-labelledby={questionId}
              className="bot-design-question-block"
            >
              <h2 id={questionId} ref={questionRef} tabIndex={-1}>
                Meet {name}
              </h2>
              <p>
                This draft comes from your answers. You can revise it before it
                becomes a saved bot.
              </p>
              <label>
                Purpose
                <textarea
                  maxLength={12000}
                  onChange={(event) =>
                    setAnswers((current) => [
                      event.target.value,
                      current[1] ?? "",
                      current[2] ?? "",
                    ])
                  }
                  value={purpose}
                />
              </label>
              <label>
                Working style
                <textarea
                  maxLength={2000}
                  onChange={(event) =>
                    setAnswers((current) => [
                      current[0] ?? "",
                      event.target.value,
                      current[2] ?? "",
                    ])
                  }
                  value={style}
                />
              </label>
              <label>
                Name
                <input
                  maxLength={80}
                  onChange={(event) =>
                    setAnswers((current) => [
                      current[0] ?? "",
                      current[1] ?? "",
                      event.target.value,
                    ])
                  }
                  value={answers[2]}
                />
              </label>
              <p className="bot-design-note">
                Saved as native Eliza system, bio and style fields. Model
                accounts and permissions are separate.
              </p>
              <button
                className="bot-design-primary"
                onClick={() => {
                  if (!purpose.trim() || !style.trim() || !name.trim()) {
                    setError(
                      "Keep a purpose, working style and name in your draft.",
                    );
                    return;
                  }
                  setError("");
                  setReviewing(true);
                }}
                type="button"
              >
                Review model and access
              </button>
            </section>
          ) : (
            <section
              aria-labelledby={questionId}
              className="bot-design-question-block"
            >
              <h2 id={questionId} ref={questionRef} tabIndex={-1}>
                Choose {name}’s model and access
              </h2>
              <p>
                No accounts or mutation permissions are granted automatically.
              </p>
              <div className="bot-design-fields">
                <label>
                  Provider
                  <input
                    maxLength={80}
                    onChange={(event) => setProvider(event.target.value)}
                    value={provider}
                  />
                </label>
                <label>
                  Model
                  <input
                    maxLength={160}
                    onChange={(event) => setModel(event.target.value)}
                    value={model}
                  />
                </label>
              </div>
              <label>
                Workspace path
                <input
                  onChange={(event) => setBotWorkspace(event.target.value)}
                  value={botWorkspace}
                />
              </label>
              <fieldset>
                <legend>Permissions</legend>
                <label className="bot-design-check">
                  <input
                    checked={allowMutation}
                    onChange={(event) => setAllowMutation(event.target.checked)}
                    type="checkbox"
                  />
                  Allow file and tool changes
                </label>
                <label className="bot-design-check">
                  <input
                    checked={allowDelegation}
                    onChange={(event) =>
                      setAllowDelegation(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Allow delegation
                </label>
              </fieldset>
              <fieldset>
                <legend>Model accounts</legend>
                {accountOptions.map((account) => (
                  <label className="bot-design-check" key={account.id}>
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
                ))}
                {!accountOptions.length ? (
                  <p className="bot-design-note" role="status">
                    {accountError
                      ? "Accounts unavailable. You can save this bot, but connect an approved model account before chatting."
                      : accountPool
                        ? "No model accounts connected. You can save this bot and connect one later."
                        : "Checking model accounts…"}
                  </p>
                ) : null}
              </fieldset>
              <p className="bot-design-note">
                Model accounts do not grant access to external apps. Your
                existing account credentials are referenced, never copied into
                the character.
              </p>
              <button
                aria-busy={saving}
                className="bot-design-primary"
                disabled={saving}
                onClick={() => void save()}
                type="button"
              >
                {saving ? `Saving ${name}…` : `Create ${name}`}
              </button>
            </section>
          )}
          {error ? (
            <p id={errorId} role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      <footer className="bot-design-dock">
        {step < questions.length ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              reply(answer);
            }}
          >
            <textarea
              aria-describedby={error ? errorId : undefined}
              aria-label="Your answer"
              aria-labelledby={questionId}
              maxLength={step === 2 ? 80 : step === 1 ? 2000 : 12000}
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  reply(answer);
                }
              }}
              placeholder="Type your own answer…"
              ref={inputRef}
              rows={1}
              value={answer}
            />
            <button
              aria-label="Send answer"
              className="bot-design-icon"
              type="submit"
            >
              <ArrowUp aria-hidden size={18} />
            </button>
          </form>
        ) : null}
        {step > 0 ? (
          <button
            className="bot-design-back"
            disabled={saving}
            onClick={() => {
              setError("");
              if (reviewing) setReviewing(false);
              else {
                setAnswer(answers.at(-1) ?? "");
                setAnswers((current) => current.slice(0, -1));
              }
            }}
            type="button"
          >
            <ArrowLeft aria-hidden size={14} />
            {reviewing ? "Back to character" : "Previous answer"}
          </button>
        ) : null}
      </footer>
    </section>
  );
}
