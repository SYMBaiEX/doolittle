import {
  supportsTerminalUnicode,
  terminalColorEnabled,
  terminalGlyph,
} from "./terminal-capabilities";

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

/**
 * Wrap value in an ANSI tone when the terminal color policy allows it.
 * Piped output and NO_COLOR environments get the bare text so logs stay
 * free of escape bytes. The policy resolves per call — a handful of
 * property reads on infrequent line-mode output — so tests and embedded
 * runners that mutate the environment see the current policy.
 */
export function paint(value: string, tone: string): string {
  if (!terminalColorEnabled()) {
    return value;
  }
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
        paint(
          `${terminalGlyph("◆", "*")} ${title}`,
          bootstrapColor.orange + bootstrapColor.bold,
        ),
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
    console.log(
      paint(`  ${terminalGlyph("⚠", "!")} ${message}`, bootstrapColor.amber),
    );
  }

  function banner(): void {
    if (getWizardScreen()) {
      return;
    }
    const unicode = supportsTerminalUnicode();
    const frame = unicode
      ? {
          top: "╔══════════════════════════════════════════════════════════════╗",
          side: "║",
          bottom:
            "╚══════════════════════════════════════════════════════════════╝",
        }
      : {
          top: "+--------------------------------------------------------------+",
          side: "|",
          bottom:
            "+--------------------------------------------------------------+",
        };
    console.log(
      [
        paint(frame.top, bootstrapColor.orange),
        paint(
          `${frame.side}                      DOOLITTLE // AWAKENING                ${frame.side}`,
          bootstrapColor.orange + bootstrapColor.bold,
        ),
        paint(
          `${frame.side}        Nub-powered onboarding for the ElizaOS alpha stack  ${frame.side}`,
          bootstrapColor.orange,
        ),
        paint(frame.bottom, bootstrapColor.orange),
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
