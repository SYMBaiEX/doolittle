import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  new URL("../CodingWorkspacePage.tsx", import.meta.url),
  "utf8",
);

describe("Code preview surface wiring", () => {
  it("keeps the Browser mounted but inactive and inert until Preview is selected", () => {
    expect(pageSource).toContain(
      'const [localSurface, setLocalSurface] = useState<CodeSurface>("workspace")',
    );
    expect(pageSource).toContain(
      "const surface = controlledSurface ?? localSurface",
    );
    expect(pageSource).toContain('hidden={surface !== "preview"}');
    expect(pageSource).toContain('inert={surface !== "preview"}');
    expect(pageSource).toContain('active={active && surface === "preview"}');
    expect(pageSource).toContain("contextual");
  });

  it("keeps preview evidence handoff scoped to the active workspace", () => {
    expect(pageSource).toMatch(
      /onSendToChat\(\{\s+text,\s+workspacePath,\s+projectScope,\s+origin:/u,
    );
    expect(pageSource).toContain(
      "{ botId, originConversationId, workspacePath }",
    );
  });
});
