import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeSetupChecklist,
  normalizeSetupSnapshot,
  selectPrimarySetupSnapshot,
} from "./SetupPage";

describe("SetupPage projections", () => {
  it("keeps optional account and checklist disclosures compact", () => {
    const styles = readFileSync(
      new URL("./diagnostics-pages.css", import.meta.url),
      "utf8",
    );

    expect(styles).toMatch(
      /\.setup-account-bar\s*\{[^}]*min-height:\s*48px;/su,
    );
    expect(styles).toMatch(
      /\.setup-guidance > summary\s*\{[^}]*min-height:\s*52px;/su,
    );
  });

  it("preserves the native string checklist as guidance", () => {
    expect(
      normalizeSetupChecklist({
        checklist: [
          "Run /doctor after configuration changes.",
          "  ",
          { id: "provider", summary: "Connect a provider", status: "done" },
        ],
      }),
    ).toEqual([
      {
        id: "guidance-0",
        label: "Run /doctor after configuration changes.",
        detail: "",
        status: "",
      },
      {
        id: "provider",
        label: "Connect a provider",
        detail: "",
        status: "done",
      },
    ]);
  });

  it("projects the structured operator summary without object stringification", () => {
    const rows = normalizeSetupSnapshot({
      summary: {
        readiness: {
          level: "needs-attention",
          headline: "Finish provider setup",
          detail: "One provider is unavailable.",
        },
        version: { version: "2.0.3-beta.7", node: "24.1.0", nub: "0.7.4" },
        providers: [{ ready: true }, { ready: false }],
        transports: [{ ready: true }],
        directories: [{ exists: true }, { exists: false }],
        nativeServices: [{ count: 2 }, { services: ["forms", "skills"] }],
      },
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "readiness",
          value: "Needs attention",
          detail: "Finish provider setup · One provider is unavailable.",
          tone: "warn",
        }),
        expect.objectContaining({
          id: "providers",
          value: "1/2 ready",
        }),
        expect.objectContaining({ id: "services", value: "4 available" }),
      ]),
    );
    expect(JSON.stringify(rows)).not.toContain("[object Object]");
    expect(selectPrimarySetupSnapshot(rows).map((row) => row.id)).toEqual([
      "readiness",
      "providers",
      "transports",
      "services",
    ]);
  });

  it("keeps a bounded fallback when the native summary has no primary rows", () => {
    const rows = normalizeSetupSnapshot({
      summary: {
        version: { version: "2.0.3-beta.7" },
        directories: [{ exists: true }],
      },
    });

    expect(selectPrimarySetupSnapshot(rows)).toEqual(rows);
  });
});
