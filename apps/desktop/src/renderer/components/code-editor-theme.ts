import type { editor } from "monaco-editor";
import type { DesktopThemeProfile } from "../desktop-theme";

const NAMED_EDITOR_COLORS: Readonly<Record<string, string>> = {
  black: "000000",
  blue: "0000FF",
  cyan: "00FFFF",
  gray: "808080",
  green: "00A86B",
  magenta: "FF00FF",
  orange: "FF7A00",
  red: "FF0000",
  white: "FFFFFF",
  yellow: "FFD700",
};

function editorColor(value: string | undefined, fallback: string): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  const hex = candidate.replace(/^#/u, "").toUpperCase();
  if (/^[\dA-F]{3}$/u.test(hex)) {
    return `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
  }
  if (/^[\dA-F]{6}$/u.test(hex)) return hex;
  if (/^[\dA-F]{8}$/u.test(hex)) return hex.slice(0, 6);
  const named = NAMED_EDITOR_COLORS[candidate.toLowerCase()];
  if (named) return named;

  const probe = document.createElement("span");
  probe.hidden = true;
  probe.style.color = candidate;
  if (!probe.style.color) return fallback;
  document.documentElement.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const rgb = resolved.match(
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/iu,
  );
  if (!rgb) return fallback;
  return rgb
    .slice(1, 4)
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(Number(channel))))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

function isLightEditorColor(color: string): boolean {
  const channels = [0, 2, 4].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  return (
    (channels[0] * 299 + channels[1] * 587 + channels[2] * 114) / 1000 >= 150
  );
}

function mixEditorColors(
  foreground: string,
  background: string,
  amount: number,
): string {
  return [0, 2, 4]
    .map((offset) =>
      Math.round(
        Number.parseInt(foreground.slice(offset, offset + 2), 16) * amount +
          Number.parseInt(background.slice(offset, offset + 2), 16) *
            (1 - amount),
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")
    .toUpperCase();
}

export function doolittleEditorTheme(
  profile: DesktopThemeProfile | null,
  appearance: "dark" | "light" = "dark",
): editor.IStandaloneThemeData {
  const accent = editorColor(profile?.primary, "FF711A");
  const secondary = editorColor(profile?.secondary, "F0A15F");
  const amber = editorColor(profile?.amberGlow, "E7A84D");
  const green = editorColor(profile?.greenGlow, "86B875");
  const cyan = editorColor(profile?.cyanGlow, secondary);
  const magenta = editorColor(profile?.magentaGlow, secondary);
  const muted = editorColor(
    appearance === "light" ? undefined : profile?.muted,
    appearance === "light" ? "635950" : "80776F",
  );
  const background = editorColor(
    appearance === "light" ? undefined : (profile?.panelBg ?? profile?.baseBg),
    appearance === "light" ? "FDFBF8" : "0C0B0A",
  );
  const foreground = editorColor(
    appearance === "light" ? undefined : profile?.baseFg,
    appearance === "light" ? "211D19" : "DCD5CE",
  );
  const light = isLightEditorColor(background);
  const surface = mixEditorColors(foreground, background, 0.05);
  const border = mixEditorColors(foreground, background, 0.18);
  const lineNumber = mixEditorColors(foreground, background, 0.48);

  return {
    base: light ? "vs" : "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: muted, fontStyle: "italic" },
      { token: "keyword", foreground: accent },
      { token: "keyword.control", foreground: accent },
      { token: "type", foreground: secondary },
      { token: "type.identifier", foreground: cyan },
      { token: "identifier", foreground },
      { token: "string", foreground: green },
      { token: "number", foreground: amber },
      { token: "regexp", foreground: magenta },
      { token: "delimiter", foreground: muted },
      { token: "tag", foreground: accent },
      { token: "attribute.name", foreground: cyan },
      { token: "attribute.value", foreground: green },
    ],
    colors: {
      "editor.background": `#${background}`,
      "editor.foreground": `#${foreground}`,
      "editor.lineHighlightBackground": `#${surface}`,
      "editor.lineHighlightBorder": "#00000000",
      "editor.selectionBackground": `#${accent}40`,
      "editor.inactiveSelectionBackground": `#${accent}22`,
      "editor.selectionHighlightBackground": `#${accent}18`,
      "editor.findMatchBackground": `#${accent}55`,
      "editor.findMatchHighlightBackground": `#${accent}26`,
      "editorCursor.foreground": `#${accent}`,
      "editorLineNumber.foreground": `#${lineNumber}`,
      "editorLineNumber.activeForeground": `#${foreground}`,
      "editorIndentGuide.background1": `#${border}`,
      "editorIndentGuide.activeBackground1": `#${accent}70`,
      "editorBracketMatch.background": `#${accent}18`,
      "editorBracketMatch.border": `#${accent}70`,
      "editorWhitespace.foreground": `#${border}`,
      "editorGutter.background": `#${background}`,
      "editorWidget.background": `#${surface}`,
      "editorWidget.border": `#${border}`,
      "editorSuggestWidget.background": `#${surface}`,
      "editorSuggestWidget.border": `#${border}`,
      "editorSuggestWidget.selectedBackground": `#${accent}22`,
      "editorHoverWidget.background": `#${surface}`,
      "editorHoverWidget.border": `#${border}`,
      "minimap.background": `#${background}`,
      "minimap.selectionHighlight": `#${accent}45`,
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": `#${muted}45`,
      "scrollbarSlider.hoverBackground": `#${muted}65`,
      "scrollbarSlider.activeBackground": `#${accent}65`,
    },
  };
}
