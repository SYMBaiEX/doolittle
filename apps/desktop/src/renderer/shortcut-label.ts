import type { DoolittleDesktopBridge } from "../shared/contracts";

export type DesktopShortcutPlatform = DoolittleDesktopBridge["platform"];

export interface DesktopShortcutChord {
  key: string;
  mod?: boolean;
  control?: boolean;
  alt?: boolean;
  shift?: boolean;
}

const MODIFIER_ORDER = ["mod", "control", "alt", "shift"] as const;
type DesktopShortcutModifier = (typeof MODIFIER_ORDER)[number];

const MAC_MODIFIER_LABELS: Record<DesktopShortcutModifier, string> = {
  mod: "⌘",
  control: "⌃",
  alt: "⌥",
  shift: "⇧",
};
const WORD_MODIFIER_LABELS: Record<DesktopShortcutModifier, string> = {
  mod: "Ctrl",
  control: "Ctrl",
  alt: "Alt",
  shift: "Shift",
};

function currentDesktopShortcutPlatform(): DesktopShortcutPlatform {
  if (typeof window === "undefined") return "linux";
  const platform = (window as unknown as { doolittle?: { platform?: unknown } })
    .doolittle?.platform;
  return platform === "darwin" || platform === "win32" || platform === "linux"
    ? platform
    : "linux";
}

/** Display one shortcut in the desktop's canonical platform-specific style. */
export function formatShortcutLabel(
  chord: DesktopShortcutChord,
  platform: DesktopShortcutPlatform = currentDesktopShortcutPlatform(),
): string {
  const key = chord.key.trim();
  if (!key) throw new Error("A shortcut key is required.");
  const labels =
    platform === "darwin" ? MAC_MODIFIER_LABELS : WORD_MODIFIER_LABELS;
  return [
    ...MODIFIER_ORDER.filter((modifier) => chord[modifier]).map(
      (modifier) => labels[modifier],
    ),
    key.length === 1 ? key.toUpperCase() : key,
  ].join(" ");
}
