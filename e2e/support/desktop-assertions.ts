import { expect, type Page } from "@playwright/test";

function safeDiagnosticSummary(value: string): string {
  return value
    .replace(
      /\b(?:sk-[\w-]{12,}|AIza[\w-]{20,}|gh[pousr]_[\w]{12,}|github_pat_[\w_]{12,}|xox[baprs]-[\w-]{12,})\b/giu,
      "[redacted]",
    )
    .replace(
      /\b(Bearer|authorization|api[_ -]?key|token|secret|password)(\s*[:=]\s*)[^\s,;]+/giu,
      "$1$2[redacted]",
    )
    .replace(/https?:\/\/[^\s"'<>]+/giu, "[url]")
    .replace(/(?:[A-Za-z]:)?(?:[\\/][^\s"'<>:]+)+/gu, "[path]")
    .replace(/\s+/gu, " ")
    .slice(0, 240);
}

export async function expectNoDesktopRecovery(page: Page): Promise<void> {
  const recovery = page.locator(".recovery-shell");
  try {
    await expect(recovery).toHaveCount(0, { timeout: 5_000 });
  } catch (error) {
    const message = await page
      .locator(".recovery-shell .recovery-details pre")
      .textContent()
      .catch(() => null);
    if (!message) throw error;
    const summary = safeDiagnosticSummary(message);
    throw new Error(`Desktop renderer entered recovery: ${summary}`);
  }
}
