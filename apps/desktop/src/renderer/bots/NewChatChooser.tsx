import type { BotSummary } from "@doolittle/contracts/bots";
import { Plus, Search, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useModalFocusBoundary } from "../components/useModalFocusBoundary";

export function NewChatChooser({
  bots,
  loading,
  busy = false,
  error,
  transitionError = "",
  onChoose,
  onCreate,
  onClose,
  onRetry,
  returnFocusTarget,
}: {
  bots: readonly BotSummary[];
  loading: boolean;
  busy?: boolean;
  error: string;
  transitionError?: string;
  onChoose: (botId: string) => void;
  onCreate: () => void;
  onClose: () => void;
  onRetry: () => void;
  returnFocusTarget: HTMLElement | null;
}) {
  const [query, setQuery] = useState("");
  const titleId = useId();
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useModalFocusBoundary({
    active: true,
    initialFocusSelector: "input",
    isolationBoundaryRef: backdropRef,
    isolateBackground: true,
    onClose: () => {
      if (!busy) onClose();
    },
    restoreFocus: true,
    restoreFocusTarget: returnFocusTarget,
  });
  const matches = bots.filter(
    (bot) =>
      !bot.archivedAt &&
      bot.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className="new-chat-backdrop" ref={backdropRef}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="new-chat-chooser"
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>Start a chat with…</h2>
          <button
            aria-label="Close new chat"
            disabled={busy}
            className="bot-design-icon"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden size={18} />
          </button>
        </header>
        <label className="new-chat-search">
          <Search aria-hidden size={16} />
          <input
            aria-label="Find a bot"
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Choose your bot"
            value={query}
          />
        </label>
        <button
          className="new-chat-choice"
          disabled={busy}
          onClick={onCreate}
          type="button"
        >
          <span aria-hidden className="new-chat-avatar">
            <Plus size={18} />
          </span>
          <span>
            <strong>Create a new bot</strong>
            <small>Design its character in a conversation</small>
          </span>
        </button>
        <section aria-label="Available bots" className="new-chat-bots">
          {matches.map((bot) => (
            <button
              className="new-chat-choice"
              disabled={busy}
              key={bot.id}
              onClick={() => onChoose(bot.id)}
              type="button"
            >
              <span aria-hidden className="new-chat-avatar">
                {bot.name.slice(0, 1)}
              </span>
              <span>
                <strong>{bot.name}</strong>
                <small>
                  {bot.isDefault
                    ? "Your lead agent"
                    : bot.character?.bio
                      ? typeof bot.character.bio === "string"
                        ? bot.character.bio
                        : bot.character.bio[0]
                      : "Start a new conversation"}
                </small>
              </span>
            </button>
          ))}
          {loading ? (
            <p role="status">Loading bots…</p>
          ) : !error && matches.length === 0 ? (
            <p>No bots match that name.</p>
          ) : null}
          {error ? (
            <p role="alert">
              Bots could not be loaded.{" "}
              <button className="text-button" onClick={onRetry} type="button">
                Try again
              </button>
            </p>
          ) : null}
          {transitionError ? (
            <p role="alert">{transitionError} Choose a bot to try again.</p>
          ) : null}
          {busy ? <p role="status">Opening your conversation…</p> : null}
        </section>
      </div>
    </div>
  );
}
