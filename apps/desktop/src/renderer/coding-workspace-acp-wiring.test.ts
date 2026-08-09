import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const controllerSource = readFileSync(
  new URL("./CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);
const editorSource = readFileSync(
  new URL("./coding-workspace/CodingWorkspaceEditor.tsx", import.meta.url),
  "utf8",
);

describe("Code workspace ACP task wiring", () => {
  it("submits the explicit editor task through the ACP bridge", () => {
    expect(controllerSource).toContain("await acpEditor.prompt(acpTaskDraft);");
    expect(controllerSource).toContain("onSubmitAcpTask={submitAcpTask}");
    expect(editorSource).toContain('aria-label="ACP editor task"');
    expect(editorSource).toContain(
      "onSubmit={(event) => void onSubmitAcpTask(event)}",
    );
  });

  it("keeps chat handoff and ACP execution as separate user actions", () => {
    expect(controllerSource).toContain("onSendToChat({");
    expect(editorSource).toMatch(/>\s*ACP task\s*<\/button>/);
    expect(editorSource).toContain("Ask Doolittle");
  });
});
