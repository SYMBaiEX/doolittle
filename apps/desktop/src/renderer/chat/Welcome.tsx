export function Welcome({
  onSelect,
  projectName,
}: {
  onSelect: (prompt: string) => void;
  projectName?: string;
}) {
  const prompts = [
    {
      prompt: "Review a difficult decision",
      detail: "Pressure-test the tradeoffs",
    },
    {
      prompt: "Plan the next piece of work",
      detail: "Turn the ambiguity into action",
    },
    {
      prompt: "Investigate a technical question",
      detail: "Trace the answer from evidence",
    },
  ];
  return (
    <div className="chat-welcome">
      <span className="eyebrow">{"PRIVATE LOCAL RUNTIME"}</span>
      <h1>
        What are you
        <br />
        <em>working through?</em>
      </h1>
      <p>
        {projectName
          ? `A focused conversation for ${projectName}. Project context stays attached.`
          : "Think clearly, investigate deeply, and turn ideas into working software."}
      </p>
      <div className="starter-grid">
        {prompts.map(({ prompt, detail }, index) => (
          <button key={prompt} onClick={() => onSelect(prompt)} type="button">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{prompt}</strong>
            <small>{detail}</small>
            <i aria-hidden="true">↗</i>
          </button>
        ))}
      </div>
    </div>
  );
}
