// Automation-run conversations must be recognizable in session lists without
// opening them. The first stored message of an automation turn is the raw
// execution envelope (identical across automations up to truncation), so the
// row title is claimed explicitly at generation time instead.

const MAX_TITLE_LENGTH = 64;

function twoDigit(value: number): string {
  return String(value).padStart(2, "0");
}

/** Compact local timestamp, e.g. 2026-11-25 19:04. */
export function automationRunTimestamp(runAt: Date | string): string {
  const date = runAt instanceof Date ? runAt : new Date(runAt);
  const time = Number.isFinite(date.getTime()) ? date : new Date();
  return (
    `${time.getFullYear()}-${twoDigit(time.getMonth() + 1)}-${twoDigit(time.getDate())} ` +
    `${twoDigit(time.getHours())}:${twoDigit(time.getMinutes())}`
  );
}

/**
 * Title for the conversation an automation run persists into: the display
 * name operators recognize plus the run timestamp that tells runs apart.
 * Execution metadata (prompt, action, payload) stays inside the transcript.
 */
export function automationRunSessionTitle(
  name: string,
  runAt: Date | string,
): string {
  const normalizedName =
    name
      .replace(/[`\p{Cc}\p{Cf}]/gu, "")
      .replace(/\s+/gu, " ")
      .trim() || "Automation";
  const timestamp = automationRunTimestamp(runAt);
  const suffix = ` · ${timestamp}`;
  const title = `${normalizedName}${suffix}`;
  const characters = Array.from(title);
  if (characters.length <= MAX_TITLE_LENGTH) return title;
  const budget = MAX_TITLE_LENGTH - Array.from(suffix).length - 1;
  if (budget < 1) return suffix.trimStart().slice(0, MAX_TITLE_LENGTH);
  const truncated = Array.from(normalizedName).slice(0, budget).join("");
  const boundary = truncated.lastIndexOf(" ");
  return `${boundary >= Math.floor(budget / 2) ? truncated.slice(0, boundary) : truncated}…${suffix}`;
}
