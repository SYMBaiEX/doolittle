export interface BootstrapWizardScreenAdapter {
  setSection(title: string, detail?: string): void;
  appendLine(message: string): void;
}

export const bootstrapColor = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  orange: "\u001b[38;2;255;106;0m",
  amber: "\u001b[38;2;255;176;0m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  magenta: "\u001b[35m",
  red: "\u001b[31m",
} as const;

export function paint(value: string, tone: string): string {
  return `${tone}${value}${bootstrapColor.reset}`;
}

export function createBootstrapOutput(
  getWizardScreen: () => BootstrapWizardScreenAdapter | null,
) {
  function section(title: string, detail?: string): void {
    const wizardScreen = getWizardScreen();
    if (wizardScreen) {
      wizardScreen.setSection(title, detail);
      return;
    }
    console.log(
      [
        "",
        paint(`◆ ${title}`, bootstrapColor.orange + bootstrapColor.bold),
        detail ? paint(`  ${detail}`, bootstrapColor.dim) : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  function info(message: string): void {
    const wizardScreen = getWizardScreen();
    if (wizardScreen) {
      wizardScreen.appendLine(message);
      return;
    }
    console.log(paint(`  ${message}`, bootstrapColor.dim));
  }

  function warn(message: string): void {
    const wizardScreen = getWizardScreen();
    if (wizardScreen) {
      wizardScreen.appendLine(`WARNING: ${message}`);
      return;
    }
    console.log(paint(`  ⚠ ${message}`, bootstrapColor.amber));
  }

  function banner(): void {
    if (getWizardScreen()) {
      return;
    }
    console.log(
      [
        paint(
          "╔══════════════════════════════════════════════════════════════╗",
          bootstrapColor.orange,
        ),
        paint(
          "║                      DOOLITTLE // AWAKENING                ║",
          bootstrapColor.orange + bootstrapColor.bold,
        ),
        paint(
          "║        Bun-first onboarding for the ElizaOS alpha stack    ║",
          bootstrapColor.orange,
        ),
        paint(
          "╚══════════════════════════════════════════════════════════════╝",
          bootstrapColor.orange,
        ),
        paint(
          "  A first-contact ritual for shaping a mind, a body, and a presence.",
          bootstrapColor.dim,
        ),
      ].join("\n"),
    );
  }

  return {
    banner,
    info,
    section,
    warn,
  };
}
