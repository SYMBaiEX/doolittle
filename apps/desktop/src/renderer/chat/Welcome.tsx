import {
  ArrowUpRight,
  Bug,
  Command,
  Compass,
  FileCode2,
  GitPullRequest,
  ListChecks,
  Search,
  Sparkles,
} from "lucide-react";
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
          icon: FileCode2,
          detail: "Map its structure and important files",
        },
        {
          prompt: "Plan a change",
          icon: ListChecks,
          detail: "Sketch the implementation and checks",
        },
        {
          prompt: "Investigate a bug",
          icon: Bug,
          detail: "Trace the failure to a likely cause",
        },
        {
          prompt: "Review my changes",
          icon: GitPullRequest,
          detail: "Look for regressions in the diff",
        },
      ]
    : [
        {
          prompt: "Help me think something through",
          icon: Compass,
          detail: "Work through a decision or idea",
        },
        {
          prompt: "Research a question",
          icon: Search,
          detail: "Find sources and explain what matters",
        },
        {
          prompt: "Plan my next steps",
          icon: ListChecks,
          detail: "Break a goal into manageable steps",
        },
      ];
  return (
    <div
      className="chat-welcome"
      data-composition={illustrated ? "illustrated" : "plain"}
    >
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
            "What are we working on?"
          )}
        </h1>
        {projectName ? (
          <p>
            {botName} in{" "}
            <span className="welcome-workspace-name">{projectName}</span>
          </p>
        ) : null}
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
        <summary>Starter prompts</summary>
        <ul
          aria-label="Conversation starters"
          className="starter-grid chat-welcome-starters"
        >
          {prompts.map(({ prompt, detail, icon }, index) => (
            <li key={prompt}>
              <button
                className="chat-welcome-starter"
                onClick={() => onSelect(prompt)}
                type="button"
              >
                {illustrated ? (
                  <span className="welcome-card-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                ) : (
                  <UiIcon className="welcome-card-icon" icon={icon} size="sm" />
                )}
                <strong>{prompt}</strong>
                {illustrated ? <small>{detail}</small> : null}
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
