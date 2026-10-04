export function Welcome({
  onSelect,
  projectName,
}: {
  onSelect: (prompt: string) => void;
  projectName?: string;
}) {
  const prompts = [
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
  ];
  return (
    <div className="chat-welcome">
      <div className="chat-welcome-command" aria-hidden="true">
        <span>~/doolittle</span>
        <span>$ new session</span>
      </div>
      <h1>Start a task</h1>
      <p>
        {projectName
          ? `Doolittle will use the open ${projectName} project as context.`
          : "Choose a coding task to give Doolittle a clear starting point."}
      </p>
      <div className="starter-grid">
        {prompts.map(({ prompt, detail }, index) => (
          <button key={prompt} onClick={() => onSelect(prompt)} type="button">
            <span className="starter-index" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <strong>{prompt}</strong>
            <small>{detail}</small>
            <UiIcon icon={ArrowUpRight} size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
}

import { ArrowUpRight } from "lucide-react";
import { UiIcon } from "../components/UiIcon";
