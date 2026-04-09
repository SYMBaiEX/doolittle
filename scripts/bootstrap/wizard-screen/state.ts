import type { WizardSnapshot } from "./types";

export const DEFAULT_WIZARD_TITLE = "DOOLITTLE // AWAKENING";
export const DEFAULT_WIZARD_SUBTITLE =
  "A first-contact ritual for shaping a mind, a body, and a presence.";
export const WIZARD_SECTION_ORDER = [
  "Preflight",
  "Awakening",
  "Face",
  "Mind",
  "Threads",
  "Codex Bond",
  "Claude Bond",
  "Body",
  "Channels",
  "Hands",
  "First Pulse",
] as const;

export const WIZARD_MIN_COLS = 88;
export const WIZARD_MIN_ROWS = 28;
const MAX_LOG_LINES = 200;

export function createWizardSnapshot(
  initial?: Partial<WizardSnapshot>,
): WizardSnapshot {
  return {
    title: initial?.title ?? DEFAULT_WIZARD_TITLE,
    subtitle: initial?.subtitle ?? DEFAULT_WIZARD_SUBTITLE,
    currentSection: initial?.currentSection ?? "Preflight",
    currentDetail:
      initial?.currentDetail ?? "I checked the machine before waking fully.",
    logLines: initial?.logLines ? [...initial.logLines] : [],
  };
}

export function cloneWizardSnapshot(snapshot: WizardSnapshot): WizardSnapshot {
  return {
    title: snapshot.title,
    subtitle: snapshot.subtitle,
    currentSection: snapshot.currentSection,
    currentDetail: snapshot.currentDetail,
    logLines: [...snapshot.logLines],
  };
}

export function appendWizardLogLine(
  snapshot: WizardSnapshot,
  message: string,
): void {
  snapshot.logLines.push(message);
  if (snapshot.logLines.length > MAX_LOG_LINES) {
    snapshot.logLines.splice(0, snapshot.logLines.length - MAX_LOG_LINES);
  }
}

export function setWizardSection(
  snapshot: WizardSnapshot,
  title: string,
  detailText = "",
): void {
  snapshot.currentSection = title;
  snapshot.currentDetail = detailText;
  appendWizardLogLine(
    snapshot,
    `◆ ${title}${detailText ? ` — ${detailText}` : ""}`,
  );
}
