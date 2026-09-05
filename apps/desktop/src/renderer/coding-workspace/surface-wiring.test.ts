import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("../CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);

describe("Code preview surface wiring", () => {
  it("keeps the Browser mounted but inactive and inert until Preview is selected", () => {
    expect(pageSource).toContain(
      'const [surface, setSurface] = useState<CodeSurface>("workspace")',
    );
    expect(pageSource).toContain('hidden={surface !== "preview"}');
    expect(pageSource).toContain('inert={surface !== "preview"}');
    expect(pageSource).toContain('active={active && surface === "preview"}');
    expect(pageSource).toContain("contextual");
  });

  it("keeps preview evidence handoff scoped to the active workspace", () => {
    expect(pageSource).toContain(
      "onSendToChat({ text, workspacePath, projectScope })",
    );
  });
});
