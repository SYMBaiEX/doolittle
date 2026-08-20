// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { doolittleEditorTheme } from "./code-editor-theme";

describe("Doolittle code editor theme", () => {
  it("maps a shared dark profile into Monaco canvas and syntax colors", () => {
    const theme = doolittleEditorTheme({
      name: "midnight-grid",
      label: "Midnight Grid",
      tagline: "Shared operator palette",
      primary: "#7c3aed",
      secondary: "#22d3ee",
      amberGlow: "#f59e0b",
      greenGlow: "#22c55e",
      cyanGlow: "#06b6d4",
      magentaGlow: "#d946ef",
      muted: "#64748b",
      baseBg: "#020617",
      baseFg: "#f8fafc",
      panelBg: "#0f172a",
    });

    expect(theme.base).toBe("vs-dark");
    expect(theme.colors).toMatchObject({
      "editor.background": "#0F172A",
      "editor.foreground": "#F8FAFC",
      "editorCursor.foreground": "#7C3AED",
      "editorLineNumber.foreground": "#7F848F",
      "editorWidget.background": "#1B2235",
      "editorWidget.border": "#394050",
      "editorSuggestWidget.selectedBackground": "#7C3AED22",
    });
    expect(theme.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ token: "keyword", foreground: "7C3AED" }),
        expect.objectContaining({ token: "type", foreground: "22D3EE" }),
        expect.objectContaining({ token: "string", foreground: "22C55E" }),
        expect.objectContaining({ token: "number", foreground: "F59E0B" }),
        expect.objectContaining({ token: "regexp", foreground: "D946EF" }),
      ]),
    );
  });

  it("supports a light imported canvas and CSS color functions", () => {
    const theme = doolittleEditorTheme({
      name: "shared-light",
      label: "Shared Light",
      tagline: "",
      primary: "rgb(37, 99, 235)",
      secondary: "cyan",
      amberGlow: "yellow",
      greenGlow: "green",
      baseBg: "#ffffff",
      baseFg: "#111827",
      panelBg: "#f8fafc",
    });

    expect(theme.base).toBe("vs");
    expect(theme.colors).toMatchObject({
      "editor.background": "#F8FAFC",
      "editor.foreground": "#111827",
      "editorCursor.foreground": "#2563EB",
      "editorLineNumber.foreground": "#898E96",
      "editorWidget.background": "#ECEFF1",
      "editorWidget.border": "#CED1D6",
    });
  });
});
