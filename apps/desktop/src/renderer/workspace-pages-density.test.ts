import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldShowSessionEmptyLanding } from "./WorkspacePages";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("workspace route density", () => {
  it("uses one empty landing until sessions or an active search exist", () => {
    expect(shouldShowSessionEmptyLanding(0, "")).toBe(true);
    expect(shouldShowSessionEmptyLanding(0, "   ")).toBe(true);
    expect(shouldShowSessionEmptyLanding(0, "README")).toBe(false);
    expect(shouldShowSessionEmptyLanding(1, "")).toBe(false);
  });

  it("keeps secondary session context closed until requested", () => {
    const page = read("./WorkspacePages.tsx");
    const detail = read("./sessions/SessionDetail.tsx");

    expect(page).toContain("<SessionDetail");
    expect(
      detail.match(/<details className="session-insight-disclosure">/gu),
    ).toHaveLength(2);
    expect(detail).not.toContain(
      '<details className="session-insight-disclosure" open>',
    );
  });
});
