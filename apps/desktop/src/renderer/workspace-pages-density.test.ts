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
    const detail = read("./sessions/SessionDetail.tsx");
    const css = read("./sessions/sessions.css");

    expect(page).toContain("<SessionDetail");
    expect(page).toContain("active={active}");
    expect(
      detail.match(/className="session-insight-disclosure"/gu),
    ).toHaveLength(2);
    expect(detail).not.toContain(
      '<details className="session-insight-disclosure" open>',
    );
    expect(detail).not.toContain('"/sessions/summary?');
    expect(detail).toContain("requestPolicy.continuity");
    expect(detail).toContain("continuityOpen && continuity.loading");
    expect(detail).toContain('className="session-detail-stack"');
    expect(detail).toContain('className="session-transcript-panel"');
    expect(detail).toContain(">Persisted messages<");
    expect(detail).not.toContain("Session highlights");
    expect(page).toContain('import "./sessions.css"');
    expect(css).toContain(
      "grid-template-columns: clamp(250px, 24vw, 320px) minmax(0, 1fr)",
    );
    expect(css).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(css).toContain("width: min(100%, 1080px)");
    expect(css).toContain("session-transcript-panel__header");
    expect(css).toContain("width: min(100%, 720px)");
  });
});
