export interface TuiThemeProfile {
  name: string;
  label: string;
  tagline: string;
  aliases?: string[];
  sigil: string;
  shellGlyph: string;
  idleFace: string;
  busyFrames: string[];
  baseBg: string;
  baseFg: string;
  primary: string;
  secondary: string;
  amberGlow: string;
  cyanGlow: string;
  greenGlow: string;
  magentaGlow: string;
  muted: string;
  panelBg: string;
}

export interface TuiThemeSummary<Name extends string = string> {
  name: Name;
  label: string;
  tagline: string;
  aliases: string[];
  primary: string;
  secondary: string;
}
