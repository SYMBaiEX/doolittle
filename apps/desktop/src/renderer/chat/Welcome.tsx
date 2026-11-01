import { ArrowUpRight, Command, Sparkles } from "lucide-react";
import { useSyncExternalStore } from "react";
import { UiIcon } from "../components/UiIcon";
import { THEME_MANIFEST_CHANGE_EVENT } from "../desktop-theme";

function subscribeMaterial(listener: () => void) {
  window.addEventListener(THEME_MANIFEST_CHANGE_EVENT, listener);
  return () =>
    window.removeEventListener(THEME_MANIFEST_CHANGE_EVENT, listener);
}
function materialSnapshot() {
  return document.documentElement.dataset.uiMaterial ?? "flat";
}

export function Welcome({
  onSelect,
  projectName,
  botName = "Doolittle",
}: {
  onSelect: (prompt: string) => void;
  projectName?: string;
  botName?: string;
}) {
  const material = useSyncExternalStore(
    subscribeMaterial,
    materialSnapshot,
    () => "flat",
  );
  const illustrated = material === "cel" || material === "glass";
  const prompts = projectName
    ? [
        {
          prompt: "Explain this project",
          detail: "Summarize its structure and important files",
        },
        {
          prompt: "Plan a change",
          detail: "Break a feature or refactor into concrete steps",
        },
        {
          prompt: "Investigate a bug",
          detail: "Trace a failure from evidence to a likely cause",
        },
        {
          prompt: "Review my changes",
          detail: "Inspect the diff for bugs, missing tests and risks",
        },
      ]
    : [
        {
          prompt: "Help me think something through",
          detail: "Make a decision, find an approach, or untangle an idea",
        },
        {
          prompt: "Research a question",
          detail: "Gather evidence and explain what matters",
        },
        {
          prompt: "Plan my next steps",
          detail: "Turn a goal into something manageable",
        },
      ];
  return (
    <div className="chat-welcome">
      {illustrated ? (
        <div className="welcome-edition">
          <span>
            {material === "cel"
              ? "DOOLITTLE / FIELD NOTES"
              : "YOUR PERSONAL WORKSPACE"}
          </span>
          <span>{projectName ?? "Ideas • Code • Everyday"}</span>
        </div>
      ) : null}
      <div className="welcome-title-group">
        {material === "glass" ? (
          <div className="welcome-app-icon" aria-hidden="true">
            <Command className="welcome-app-glyph" />
          </div>
        ) : null}
        <h1>
          {material === "cel" ? (
            <>
              Your next
              <br />
              <em>great chapter.</em>
            </>
          ) : material === "glass" ? (
            "A little clarity. A lot of possibility."
          ) : projectName ? (
            "What should we build?"
          ) : (
            "What’s on your mind?"
          )}
        </h1>
        <p>
          {projectName
            ? `${botName} can help with ${projectName}, or anything else you’re working on.`
            : `Talk to ${botName}. Start wherever you like.`}
        </p>
      </div>
      {illustrated ? (
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-art-panel">
            <Sparkles className="welcome-art-spark" />
            <span className="welcome-art-word">
              DO
              <br />
              MORE.
            </span>
            <i className="welcome-art-diamond" />
          </div>
        </div>
      ) : null}
      <details className="chat-starter-ideas" open={illustrated || undefined}>
        <summary>Ideas to get started</summary>
        <ul
          aria-label="Conversation starters"
          className="starter-grid chat-welcome-starters"
        >
          {prompts.map(({ prompt, detail }, index) => (
            <li key={prompt}>
              <button
                className="chat-welcome-starter"
                onClick={(event) => {
                  onSelect(prompt);
                  const ideas = event.currentTarget.closest("details");
                  if (!illustrated) ideas?.removeAttribute("open");
                  if (!illustrated) ideas?.querySelector("summary")?.focus();
                }}
                type="button"
              >
                {illustrated ? (
                  <span className="welcome-card-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                ) : null}
                <strong>{prompt}</strong>
                <small>{detail}</small>
                <UiIcon
                  icon={ArrowUpRight}
                  size="sm"
                  className="welcome-card-arrow"
                />
              </button>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
