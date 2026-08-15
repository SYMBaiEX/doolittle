import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shouldShowSessionEmptyLanding } from "./sessions/SessionsPage";

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
    const page = read("./sessions/SessionsPage.tsx");
    const list = read("./sessions/SessionListPanel.tsx");
    const detail = read("./sessions/SessionDetail.tsx");
    const layout = read("./sessions/sessions-layout.ts");

    expect(page).toContain("<SessionDetail");
    expect(page).toContain("active={active}");
    expect(
      detail.match(/className=\{SESSION_DISCLOSURE_CLASS\}/gu),
    ).toHaveLength(2);
    expect(detail).not.toContain("<details open");
    expect(detail).not.toContain('"/sessions/summary?');
    expect(detail).toContain("requestPolicy.continuity");
    expect(detail).toContain("continuityOpen && continuity.loading");
    expect(detail).toContain("data-session-detail");
    expect(detail).toContain("SESSION_TRANSCRIPT_PANEL_CLASS");
    expect(detail).toContain(">Persisted messages<");
    expect(detail).not.toContain("Session highlights");
    expect(page).not.toContain('import "./sessions.css"');
    expect(layout).toContain("clamp(250px,24vw,320px)");
    expect(layout).toContain("w-[min(100%,1080px)]");
    expect(layout).toContain("w-[min(100%,720px)]");
    expect(list).toContain("export const SESSION_LIST_PAGE_SIZE = 20");
    expect(list).toContain("min-h-[38px]");
  });
});
