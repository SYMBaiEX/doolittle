import { createHash } from "node:crypto";
import type { RenderedEvidence, RenderedPageFacts } from "./rendered-capture";

type SubjectEvidence = {
  viewport: { width: number; height: number };
  candidateIndex: number;
  pngSha256: string;
  subjectSha256: string | null;
};

export type InteractiveTextCheck = {
  version: 1;
  status: "blocked" | "no-blocker-detected" | "unknown";
  blockers: Array<
    SubjectEvidence & {
      code: "equal-solid-interactive-text-colors";
    }
  >;
  clearances: Array<SubjectEvidence & { subjectSha256: string }>;
  blockersTruncated: boolean;
};

/** Deliberately not a contrast threshold or general accessibility assessment. */
export function opaqueRgb(value: string): string | undefined {
  const match = value.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(1(?:\.0+)?))?\s*\)$/u,
  );
  if (!match || (value.startsWith("rgba") && !match[4])) return undefined;
  const rgb = match.slice(1, 4).map(Number);
  return rgb.every((channel) => channel <= 255) ? rgb.join(",") : undefined;
}

/** Hash only bounded unambiguous native identities, outside page execution. */
export function interactiveTextSubject(
  qualifier: RenderedPageFacts["contrastCandidates"][number]["interactiveText"],
  complete: boolean,
): string | null {
  const subject = qualifier?.subject;
  if (
    !complete ||
    qualifier?.unambiguous !== true ||
    !Array.isArray(subject) ||
    !subject.every((part) => typeof part === "string") ||
    subject[1] !== qualifier.controlKind ||
    !["link", "button"].includes(String(qualifier.controlKind))
  )
    return null;
  if (
    !(
      (subject.length === 3 &&
        subject[0] === "id" &&
        subject[2].length > 0 &&
        subject[2].length <= 128) ||
      (subject.length === 4 &&
        subject[0] === "label" &&
        subject[2].length > 0 &&
        subject[2].length <= 200 &&
        subject[3].length <= 2048)
    )
  )
    return null;
  return createHash("sha256").update(JSON.stringify(subject)).digest("hex");
}

export function assessInteractiveText(
  captures: readonly {
    captureMode?: string;
    status: { captureReady: boolean };
    renderedEvidence?: RenderedEvidence;
  }[],
): InteractiveTextCheck {
  const blockers: InteractiveTextCheck["blockers"] = [];
  const clearances: InteractiveTextCheck["clearances"] = [];
  let blockersTruncated = false;
  const clearanceCoverage =
    captures.length === 2 &&
    captures.every((capture, index) => {
      const e = capture.renderedEvidence;
      return (
        capture.captureMode === "rendered-page" &&
        capture.status.captureReady &&
        e &&
        e.viewport.width === (index === 0 ? 1280 : 390) &&
        e.viewport.height === (index === 0 ? 720 : 844) &&
        /^[a-f0-9]{64}$/u.test(e.pixels.sha256) &&
        e.blockedRequests === 0 &&
        e.facts?.interactiveTextScan?.version === 1 &&
        e.facts.interactiveTextScan.complete &&
        Array.isArray(e.facts.interactiveTextCandidates)
      );
    });
  let unknown = captures.length !== 2;
  for (const [index, capture] of captures.entries()) {
    const evidence = capture.renderedEvidence;
    const expected = index === 0 ? [1280, 720] : [390, 844];
    if (
      !evidence ||
      capture.captureMode !== "rendered-page" ||
      !capture.status.captureReady ||
      evidence.viewport.width !== expected[0] ||
      evidence.viewport.height !== expected[1] ||
      !/^[a-f0-9]{64}$/u.test(evidence.pixels.sha256)
    ) {
      unknown = true;
      continue;
    }
    const scan = evidence.facts?.interactiveTextScan;
    unknown ||=
      scan?.version !== 1 ||
      !scan.complete ||
      scan.unknown ||
      !Array.isArray(evidence.facts?.interactiveTextCandidates) ||
      evidence.blockedRequests !== 0;
    for (const [candidateIndex, candidate] of (
      evidence.facts?.interactiveTextCandidates ?? []
    ).entries()) {
      if (
        !candidate.interactiveText ||
        candidate.interactiveText.eligibility === "unknown"
      )
        unknown = true;
      if (candidate.interactiveText?.eligibility !== "eligible") continue;
      const foreground = opaqueRgb(candidate.foreground);
      const background = candidate.background
        ? opaqueRgb(candidate.background)
        : undefined;
      if (!foreground || !background) {
        unknown = true;
        continue;
      }
      const subjectSha256 = interactiveTextSubject(
        candidate.interactiveText,
        scan?.complete === true,
      );
      unknown ||= subjectSha256 === null;
      if (foreground === background) {
        if (blockers.length >= 16) {
          blockersTruncated = true;
          continue;
        }
        blockers.push({
          code: "equal-solid-interactive-text-colors",
          viewport: evidence.viewport,
          candidateIndex,
          pngSha256: evidence.pixels.sha256,
          subjectSha256,
        });
      } else if (clearanceCoverage && subjectSha256 && clearances.length < 240)
        clearances.push({
          viewport: evidence.viewport,
          candidateIndex,
          pngSha256: evidence.pixels.sha256,
          subjectSha256,
        });
    }
  }
  return {
    version: 1,
    status: blockers.length
      ? "blocked"
      : unknown
        ? "unknown"
        : "no-blocker-detected",
    blockers,
    clearances,
    blockersTruncated,
  };
}

/** Validate receipt data without treating missing/legacy evidence as a pass. */
export function readInteractiveTextCheck(
  value: unknown,
): InteractiveTextCheck | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const check = value as InteractiveTextCheck;
  if (
    check.version !== 1 ||
    !["blocked", "no-blocker-detected", "unknown"].includes(check.status) ||
    !Array.isArray(check.blockers) ||
    check.blockers.length > 16 ||
    !Array.isArray(check.clearances) ||
    check.clearances.length > 240 ||
    typeof check.blockersTruncated !== "boolean"
  )
    return undefined;
  for (const blocker of [...check.blockers, ...check.clearances]) {
    if (
      !blocker ||
      !Number.isSafeInteger(blocker.candidateIndex) ||
      blocker.candidateIndex < 0 ||
      blocker.candidateIndex >= 120 ||
      !blocker.viewport ||
      ![
        [1280, 720],
        [390, 844],
      ].some(
        ([w, h]) =>
          blocker.viewport.width === w && blocker.viewport.height === h,
      ) ||
      typeof blocker.pngSha256 !== "string" ||
      !/^[a-f0-9]{64}$/u.test(blocker.pngSha256) ||
      (blocker.subjectSha256 !== null &&
        (typeof blocker.subjectSha256 !== "string" ||
          !/^[a-f0-9]{64}$/u.test(blocker.subjectSha256)))
    )
      return undefined;
  }
  if (
    check.blockers.some(
      (blocker) => blocker.code !== "equal-solid-interactive-text-colors",
    ) ||
    check.clearances.some((clearance) => clearance.subjectSha256 === null)
  )
    return undefined;
  if ((check.status === "blocked") !== check.blockers.length > 0)
    return undefined;
  if (check.blockersTruncated && check.status !== "blocked") return undefined;
  return check;
}

export function interactiveTextSummary(
  check: InteractiveTextCheck | undefined,
): string {
  return check?.status === "blocked"
    ? "Captured enabled interactive text has equal opaque foreground and solid background colors. This readability blocker requires scoped correction, rebuild, current readiness and a qualified fresh review; a successful critique is not completion."
    : check?.status === "no-blocker-detected"
      ? "No equal-solid-interactive-text blocker detected in this bounded check; this is not a WCAG or visual quality pass."
      : "The bounded interactive-text check has unknown or unavailable areas. Only a qualified fresh observation of an affected subject can clear its previously captured blocker; this is not a visual quality pass.";
}
