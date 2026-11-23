import { Button } from "@doolittle/ui";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PendingInputRequest } from "../chat/session-input-requests";
import {
  type ActionFeedback,
  type ApiResource,
  desktopRequest,
  errorMessage,
} from "../lib";

const OTHER_OPTION = "__other__";

interface InlineInputRequestPanelProps {
  active: boolean;
  botId: string;
  disabled?: boolean;
  onPrefillDraft: (text: string) => void;
  onSendAnswers: (text: string) => boolean | Promise<boolean>;
  requests: readonly PendingInputRequest[];
  resource: Pick<ApiResource<unknown>, "error" | "loading" | "reload">;
}

type QuestionSelection = {
  selected: Set<string>;
  customText: string;
};

function selectionComplete(selection: QuestionSelection): boolean {
  if (selection.selected.size === 0) return false;
  return (
    !selection.selected.has(OTHER_OPTION) ||
    Boolean(selection.customText.trim())
  );
}

function InputRequestCard({
  botId,
  disabled,
  onPrefillDraft,
  onSendAnswers,
  request,
  resource,
}: {
  botId: string;
  disabled?: boolean;
  onPrefillDraft: (text: string) => void;
  onSendAnswers: (text: string) => boolean | Promise<boolean>;
  request: PendingInputRequest;
  resource: Pick<ApiResource<unknown>, "error" | "loading" | "reload">;
}) {
  const [selections, setSelections] = useState<QuestionSelection[]>(() =>
    request.questions.map(() => ({ selected: new Set(), customText: "" })),
  );
  const [busy, setBusy] = useState<"answer" | "dismiss" | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);
  const mounted = useRef(true);
  const submitInFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const toggleOption = (questionIndex: number, optionKey: string) => {
    setSelections((current) =>
      current.map((selection, index) => {
        if (index !== questionIndex) return selection;
        const question = request.questions[questionIndex];
        const selected = new Set(selection.selected);
        if (question?.multiSelect) {
          if (selected.has(optionKey)) selected.delete(optionKey);
          else selected.add(optionKey);
        } else {
          selected.clear();
          if (!selection.selected.has(optionKey)) selected.add(optionKey);
        }
        return { ...selection, selected };
      }),
    );
    setFeedback(null);
  };

  const setCustomText = (questionIndex: number, customText: string) => {
    setSelections((current) =>
      current.map((selection, index) => {
        if (index !== questionIndex) return selection;
        const question = request.questions[questionIndex];
        const selected = new Set(selection.selected);
        if (customText.trim() && !question?.multiSelect) {
          selected.clear();
          selected.add(OTHER_OPTION);
        } else if (customText.trim()) {
          selected.add(OTHER_OPTION);
        }
        return { ...selection, customText, selected };
      }),
    );
    setFeedback(null);
  };

  const complete = request.questions.every((_question, index) =>
    selectionComplete(
      selections[index] ?? { selected: new Set(), customText: "" },
    ),
  );

  const submit = async () => {
    if (
      disabled ||
      !complete ||
      busy ||
      submitInFlight.current ||
      resource.loading ||
      resource.error
    )
      return;
    submitInFlight.current = true;
    setBusy("answer");
    setFeedback(null);
    try {
      const answers = request.questions.map((question, index) => {
        const selection = selections[index] ?? {
          selected: new Set<string>(),
          customText: "",
        };
        return {
          question: question.question,
          selected: question.options
            .map((option, optionIndex) =>
              selection.selected.has(`option-${optionIndex}`)
                ? option.label
                : null,
            )
            .filter((label): label is string => Boolean(label)),
          ...(selection.selected.has(OTHER_OPTION) &&
          selection.customText.trim()
            ? { customText: selection.customText.trim() }
            : {}),
        };
      });
      const response = await desktopRequest<{
        request?: unknown;
        message?: string;
      }>(
        `/execution/input-requests/${encodeURIComponent(request.id)}/answer`,
        "POST",
        { answers },
        undefined,
        undefined,
        botId,
      );
      const message =
        typeof response?.message === "string" ? response.message.trim() : "";
      if (!message) {
        setFeedback({
          tone: "good",
          message: "Answers recorded. Reply in chat to continue.",
        });
        return;
      }
      const sent = await onSendAnswers(message);
      if (!mounted.current) return;
      if (sent === false) {
        onPrefillDraft(message);
        setFeedback({
          tone: "good",
          message:
            "Answers saved into the composer. Press send when you're ready.",
        });
      }
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        tone: "bad",
        message: `Answers could not be submitted: ${errorMessage(error)}`,
      });
    } finally {
      submitInFlight.current = false;
      if (mounted.current) setBusy(null);
      void resource.reload();
    }
  };

  const dismiss = async () => {
    if (disabled || busy) return;
    setBusy("dismiss");
    setFeedback(null);
    try {
      await desktopRequest(
        `/execution/input-requests/${encodeURIComponent(request.id)}/dismiss`,
        "POST",
        {},
        undefined,
        undefined,
        botId,
      );
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        tone: "bad",
        message: `Request could not be dismissed: ${errorMessage(error)}`,
      });
    } finally {
      if (mounted.current) setBusy(null);
      void resource.reload();
    }
  };

  return (
    <article className="grid min-w-0 grid-cols-1 gap-2 border border-[var(--border)] bg-[var(--surface-raised)] p-2">
      <div className="grid min-w-0 gap-2.5">
        {request.questions.map((question, questionIndex) => {
          const selection = selections[questionIndex] ?? {
            selected: new Set<string>(),
            customText: "",
          };
          const otherSelected = selection.selected.has(OTHER_OPTION);
          return (
            <fieldset
              className="m-0 grid min-w-0 gap-1.5 border-0 p-0"
              key={`${request.id}-q-${question.question}`}
            >
              <legend className="sr-only">
                {question.header ?? `Question ${questionIndex + 1}`}
              </legend>
              <div className="grid min-w-0 gap-[3px]">
                {question.header ? (
                  <small className="text-[length:var(--text-meta)] uppercase tracking-wide text-[var(--muted)]">
                    {question.header}
                  </small>
                ) : null}
                <p className="m-0 [overflow-wrap:anywhere] text-[length:var(--text-body)] text-[var(--text-soft)]">
                  {question.question}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {question.options.map((option, optionIndex) => {
                  const optionKey = `option-${optionIndex}`;
                  const chosen = selection.selected.has(optionKey);
                  return (
                    <Button
                      aria-pressed={chosen}
                      className="!h-9 !min-h-9 gap-1.5"
                      disabled={disabled || Boolean(busy)}
                      key={optionKey}
                      onClick={() => toggleOption(questionIndex, optionKey)}
                      title={option.description}
                      type="button"
                      variant={chosen ? "default" : "outline"}
                    >
                      {chosen ? <Check aria-hidden size={12} /> : null}
                      {option.label}
                    </Button>
                  );
                })}
                <Button
                  aria-pressed={otherSelected}
                  className="!h-9 !min-h-9 gap-1.5"
                  disabled={disabled || Boolean(busy)}
                  onClick={() => toggleOption(questionIndex, OTHER_OPTION)}
                  type="button"
                  variant={otherSelected ? "default" : "outline"}
                >
                  {otherSelected ? <Check aria-hidden size={12} /> : null}
                  Other
                </Button>
              </div>
              {otherSelected ? (
                <input
                  aria-label={`Other answer for: ${question.question}`}
                  className="h-9 w-full rounded-[var(--radius-xs)] border border-[var(--border)] bg-[var(--surface)] px-2 text-[length:var(--text-body)] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--border-strong)]"
                  disabled={disabled || Boolean(busy)}
                  onChange={(event) =>
                    setCustomText(questionIndex, event.target.value)
                  }
                  placeholder="Type your own answer"
                  type="text"
                  value={selection.customText}
                />
              ) : null}
              {question.multiSelect ? (
                <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
                  Select all that apply.
                </small>
              ) : null}
            </fieldset>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          className="!h-11 !min-h-11"
          disabled={disabled || !complete || Boolean(busy)}
          onClick={() => void submit()}
          type="button"
        >
          {busy === "answer" ? "Sending…" : "Send answers"}
        </Button>
        <Button
          className="!h-11 !min-h-11"
          disabled={disabled || Boolean(busy)}
          onClick={() => void dismiss()}
          type="button"
          variant="outline"
        >
          {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
      {feedback ? (
        <p
          aria-live={feedback.tone === "bad" ? "assertive" : "polite"}
          className={`m-0 [overflow-wrap:anywhere] text-[length:var(--text-meta)] leading-relaxed ${
            feedback.tone === "bad"
              ? "text-[var(--bad)]"
              : "text-[var(--accent-text)]"
          }`}
          role={feedback.tone === "bad" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </article>
  );
}

export function InlineInputRequestPanel({
  active: enabled,
  botId,
  disabled,
  onPrefillDraft,
  onSendAnswers,
  requests,
  resource,
}: InlineInputRequestPanelProps) {
  if (!enabled || (!requests.length && !resource.error)) return null;
  return (
    <section
      data-session-approval-surface="inline"
      aria-label="Questions waiting for your input in this session"
      aria-busy={resource.loading}
      className="mb-2 flex min-w-0 w-full flex-col gap-2 border border-[var(--border-strong)] bg-[var(--surface)] p-3 text-[var(--text)] max-h-[min(45dvh,var(--session-approval-max-height,320px))]"
    >
      <header className="grid min-w-0 shrink-0 gap-1">
        <strong className="text-[length:var(--text-body)]">
          Needs your input
        </strong>
        <small className="text-[length:var(--text-meta)] text-[var(--muted)]">
          Doolittle is waiting on these answers to continue. Pick an option or
          choose Other to type your own.
        </small>
      </header>
      {resource.error ? (
        <p
          className="m-0 [overflow-wrap:anywhere] text-[length:var(--text-body)] text-[var(--bad)]"
          role="alert"
        >
          Could not load pending questions: {resource.error}
        </p>
      ) : null}
      {requests.length ? (
        <section
          aria-label="Pending input requests"
          className="grid min-h-0 min-w-0 gap-1.5 overflow-y-auto overscroll-contain pr-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must scroll all questions before answering.
          tabIndex={0}
        >
          {requests.slice(0, 2).map((request) => (
            <InputRequestCard
              botId={botId}
              disabled={disabled}
              key={request.id}
              onPrefillDraft={onPrefillDraft}
              onSendAnswers={onSendAnswers}
              request={request}
              resource={resource}
            />
          ))}
        </section>
      ) : null}
      {requests.length > 2 ? (
        <p className="m-0 text-[length:var(--text-meta)] text-[var(--muted)]">
          Showing 2 of {requests.length} requests. Newest first.
        </p>
      ) : null}
    </section>
  );
}
