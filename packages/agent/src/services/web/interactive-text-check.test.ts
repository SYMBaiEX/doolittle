import { describe, expect, it } from "vitest";
import {
  assessInteractiveText,
  opaqueRgb,
  readInteractiveTextCheck,
} from "./interactive-text-check";
import type { RenderedEvidence } from "./rendered-capture";

function captures() {
  return [
    [1280, 720],
    [390, 844],
  ].map(([width, height], index) => ({
    captureMode: "rendered-page",
    status: { captureReady: true },
    renderedEvidence: {
      viewport: { width, height },
      pixels: { sha256: (index ? "b" : "a").repeat(64) },
      blockedRequests: 0,
      facts: {
        interactiveTextScan: { version: 1, complete: true, unknown: false },
        interactiveTextCandidates: [
          {
            text: "private-label-canary",
            foreground: "rgb(24, 45, 57)",
            background: "rgb(24, 45, 57)",
            interactiveText: {
              controlKind: "link",
              eligibility: "eligible",
              subject: ["id", "link", "private-id-canary"],
              unambiguous: true,
            },
          },
        ],
      },
    } as RenderedEvidence & {
      facts: RenderedEvidence["facts"] & {
        interactiveTextCandidates: NonNullable<
          RenderedEvidence["facts"]["interactiveTextCandidates"]
        >;
      };
    },
  }));
}

describe("bounded equal-solid-interactive-text assessment", () => {
  it("records only controlled metadata for exact equality, not text", () => {
    const result = assessInteractiveText(captures());
    expect(result.status).toBe("blocked");
    expect(result.blockers).toHaveLength(2);
    expect(result.blockers[0]).toEqual({
      code: "equal-solid-interactive-text-colors",
      viewport: { width: 1280, height: 720 },
      candidateIndex: 0,
      pngSha256: "a".repeat(64),
      subjectSha256: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain("private-label");
    expect(readInteractiveTextCheck(result)).toEqual(result);
  });
  it("does not impose a contrast threshold", () => {
    const data = captures();
    for (const capture of data)
      capture.renderedEvidence.facts.interactiveTextCandidates[0].foreground =
        "rgb(25, 45, 57)";
    expect(assessInteractiveText(data).status).toBe("no-blocker-detected");
  });
  it.each([
    "legacy",
    "qualifier",
    "truncated",
    "effects",
    "blocked-resource",
    "missing-narrow",
    "text-only",
    "bad-rgb",
  ])("preserves unknown evidence: %s", (reason) => {
    const data = captures();
    for (const capture of data)
      capture.renderedEvidence.facts.interactiveTextCandidates[0].foreground =
        "rgb(250, 250, 250)";
    const e = data[0].renderedEvidence;
    if (reason === "legacy") delete e.facts.interactiveTextScan;
    if (reason === "qualifier")
      delete e.facts.interactiveTextCandidates[0].interactiveText;
    if (reason === "truncated" && e.facts.interactiveTextScan)
      e.facts.interactiveTextScan.complete = false;
    if (reason === "effects" && e.facts.interactiveTextScan)
      e.facts.interactiveTextScan.unknown = true;
    if (reason === "blocked-resource") e.blockedRequests = 1;
    if (reason === "missing-narrow") data.pop();
    if (reason === "text-only") data[0].captureMode = "text-only";
    if (reason === "bad-rgb")
      e.facts.interactiveTextCandidates[0].foreground = "rgba(24, 45, 57, .5)";
    expect(assessInteractiveText(data).status).toBe("unknown");
  });
  it("excludes decorative/inactive candidates", () => {
    const data = captures();
    for (const capture of data) {
      const qualifier =
        capture.renderedEvidence.facts.interactiveTextCandidates[0]
          .interactiveText;
      if (!qualifier) throw new Error("Missing synthetic qualifier.");
      qualifier.eligibility = "excluded";
    }
    expect(assessInteractiveText(data).status).toBe("no-blocker-detected");
  });
  it("allows subject-specific clearance alongside unrelated unsupported text", () => {
    const data = captures();
    for (const capture of data) {
      const facts = capture.renderedEvidence.facts;
      if (facts.interactiveTextScan) facts.interactiveTextScan.unknown = true;
      const candidate = facts.interactiveTextCandidates?.[0];
      if (!candidate) throw new Error("Missing synthetic candidate.");
      candidate.foreground = "rgb(250, 250, 250)";
      facts.interactiveTextCandidates?.push({
        ...candidate,
        interactiveText: { controlKind: "button", eligibility: "unknown" },
      });
    }
    const result = assessInteractiveText(data);
    expect(result.status).toBe("unknown");
    expect(result.clearances).toHaveLength(2);
    expect(JSON.stringify(result)).not.toMatch(/private-(?:label|id)-canary/);
  });
  it.each(["ambiguous", "truncated", "resources", "missing"])(
    "does not clear affected subjects with %s evidence",
    (reason) => {
      const data = captures();
      for (const capture of data) {
        const facts = capture.renderedEvidence.facts;
        const candidate = facts.interactiveTextCandidates?.[0];
        if (!candidate?.interactiveText)
          throw new Error("Missing synthetic candidate.");
        candidate.foreground = "rgb(250,250,250)";
        if (reason === "ambiguous")
          candidate.interactiveText.unambiguous = false;
        if (reason === "truncated" && facts.interactiveTextScan)
          facts.interactiveTextScan.complete = false;
        if (reason === "resources")
          capture.renderedEvidence.blockedRequests = 1;
        if (reason === "missing") facts.interactiveTextCandidates = [];
      }
      expect(assessInteractiveText(data).clearances).toHaveLength(0);
    },
  );
  it("binds subjects independently of capture-local indices", () => {
    const before = assessInteractiveText(captures());
    const data = captures();
    for (const capture of data) {
      const candidates =
        capture.renderedEvidence.facts.interactiveTextCandidates;
      if (!candidates?.[0]) throw new Error("Missing synthetic candidate.");
      candidates[0].foreground = "rgb(250,250,250)";
      candidates.unshift({
        ...candidates[0],
        interactiveText: { controlKind: "button", eligibility: "excluded" },
      });
    }
    const after = assessInteractiveText(data);
    expect(after.clearances[0].candidateIndex).toBe(1);
    expect(after.clearances[0].subjectSha256).toBe(
      before.blockers[0].subjectSha256,
    );
  });
  it("records positive overflow without granting truncated clearance", () => {
    const data = captures();
    for (const capture of data) {
      const candidates =
        capture.renderedEvidence.facts.interactiveTextCandidates;
      if (!candidates?.[0]) throw new Error("Missing synthetic candidate.");
      capture.renderedEvidence.facts.interactiveTextCandidates = Array(20).fill(
        candidates[0],
      );
    }
    const result = assessInteractiveText(data);
    expect(result.blockers).toHaveLength(16);
    expect(result.blockersTruncated).toBe(true);
  });
  it.each([
    null,
    {},
    { version: 1, status: "blocked", blockers: [] },
    { version: 1, status: "pass", blockers: [] },
    { version: 1, status: "no-blocker-detected", blockers: captures() },
  ])("rejects malformed receipt: %j", (value) => {
    expect(readInteractiveTextCheck(value)).toBeUndefined();
  });
  it.each([
    "transparent",
    "rgba(24,45,57,0.5)",
    "rgb(256,0,0)",
    "#182d39",
    "private-canary",
  ])("does not parse unsupported colors: %s", (value) =>
    expect(opaqueRgb(value)).toBeUndefined(),
  );
});
