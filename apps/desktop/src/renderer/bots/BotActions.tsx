import type { BotSummary } from "@doolittle/contracts/bots";
import { Button } from "@doolittle/ui";
import { useState } from "react";
import { desktopRequest, errorMessage } from "../lib";

/** Application-owned catalog commands, never worker-local personality changes. */
export function BotActions({ bot }: { bot: BotSummary }) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [archiveConfirmation, setArchiveConfirmation] = useState(false);
  const invoke = async (action: "stop" | "activate" | "archive") => {
    if (pending) return;
    setPending(action);
    setError("");
    try {
      await desktopRequest(
        `/bots/${encodeURIComponent(bot.id)}/${action}`,
        "POST",
      );
      setArchiveConfirmation(false);
      window.dispatchEvent(new Event("doolittle:bot-catalog-changed"));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending("");
    }
  };
  const stopped = bot.state === "stopped" || bot.state === "error";
  return (
    <section
      aria-label={`${bot.name} controls`}
      className="grid gap-3 border-t border-[var(--border)] p-4 text-sm"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={Boolean(pending)}
          onClick={() => void invoke(stopped ? "activate" : "stop")}
          type="button"
          variant="secondary"
        >
          {pending ? "Updating…" : stopped ? "Activate bot" : "Stop bot"}
        </Button>
        {!bot.isDefault ? (
          <Button
            disabled={Boolean(pending) || !stopped}
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent("doolittle:edit-bot", {
                  detail: { botId: bot.id },
                }),
              )
            }
            type="button"
            variant="ghost"
          >
            Edit bot
          </Button>
        ) : null}
      </div>
      {!stopped ? (
        <p className="m-0 text-[var(--muted)]">
          Stop ends this bot’s active work. Stop it before editing its model or
          access.
        </p>
      ) : null}
      {!bot.isDefault ? (
        archiveConfirmation ? (
          <fieldset className="grid gap-2" aria-label="Confirm bot archive">
            <p className="m-0">
              Archive {bot.name}? Its active work stops. Conversations and
              history are retained.
            </p>
            <div className="flex gap-2">
              <Button
                disabled={Boolean(pending)}
                onClick={() => void invoke("archive")}
                type="button"
                variant="destructive"
              >
                Archive bot
              </Button>
              <Button
                disabled={Boolean(pending)}
                onClick={() => setArchiveConfirmation(false)}
                type="button"
                variant="ghost"
              >
                Keep bot
              </Button>
            </div>
          </fieldset>
        ) : (
          <Button
            disabled={Boolean(pending)}
            onClick={() => setArchiveConfirmation(true)}
            type="button"
            variant="ghost"
          >
            Archive…
          </Button>
        )
      ) : null}
      {error ? (
        <p role="alert" className="m-0 text-[var(--bad)]">
          {error}
        </p>
      ) : null}
    </section>
  );
}
