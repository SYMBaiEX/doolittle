import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);

describe("Code workspace ACP task wiring", () => {
  it("submits the explicit editor task through the ACP bridge", () => {
    expect(source).toContain("await acpEditor.prompt(acpTaskDraft);");
    expect(source).toContain('aria-label="ACP editor task"');
    expect(source).toContain("onSubmit={(event) => void submitAcpTask(event)}");
  });

  it("keeps chat handoff and ACP execution as separate user actions", () => {
    expect(source).toContain("onSendToChat({");
    expect(source).toMatch(/>\s*ACP task\s*<\/button>/);
    expect(source).toContain("Ask Doolittle");
  });
});
