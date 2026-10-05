export function Welcome({
  onSelect,
  projectName,
  botName = "Doolittle",
}: {
  onSelect: (prompt: string) => void;
  projectName?: string;
  botName?: string;
}) {
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
      <h1>What’s on your mind?</h1>
      <p>
        {projectName
          ? `${botName} can help with ${projectName}, or anything else you’re working on.`
          : `Talk to ${botName}. Start wherever you like.`}
      </p>
      <details className="chat-starter-ideas">
        <summary>Ideas to get started</summary>
        <div className="starter-grid">
          {prompts.map(({ prompt, detail }, index) => (
            <button
              key={prompt}
              onClick={(event) => {
                onSelect(prompt);
                const ideas = event.currentTarget.closest("details");
                ideas?.removeAttribute("open");
                ideas?.querySelector("summary")?.focus();
              }}
              type="button"
            >
              <span className="starter-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong>{prompt}</strong>
              <small>{detail}</small>
              <UiIcon icon={ArrowUpRight} size="sm" />
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}

import { ArrowUpRight } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
