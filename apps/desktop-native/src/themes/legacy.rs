use anyhow::{Result, ensure};
use serde::Deserialize;

use super::schema::{
    Appearance, BUNDLE_KIND, Bundle, CodeColors, Density, Hex, Manifest, ModeColors, TerminalColors,
};

#[derive(Deserialize)]
pub(super) struct LegacyBundle {
    kind: String,
    version: u8,
    appearance: Appearance,
    density: Density,
    theme: LegacyProfile,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyProfile {
    name: String,
    label: String,
    tagline: Option<String>,
    primary: String,
    secondary: Option<String>,
    green_glow: Option<String>,
    amber_glow: Option<String>,
    cyan_glow: Option<String>,
    magenta_glow: Option<String>,
    muted: Option<String>,
    panel_bg: Option<String>,
    base_bg: Option<String>,
    base_fg: Option<String>,
}

impl LegacyBundle {
    pub(super) fn migrate(self, base: &Manifest) -> Result<Bundle> {
        ensure!(
            self.kind == "doolittle.theme" && self.version == 1,
            "Unsupported legacy theme."
        );
        let old = self.theme;
        let primary =
            color(&old.primary).ok_or_else(|| anyhow::anyhow!("Invalid primary theme color."))?;
        let secondary = old.secondary.as_deref().and_then(color).unwrap_or(primary);
        let dark_ink = Hex::new(0x160b03);
        let accent_ink = if dark_ink.contrast(primary) >= 4.5 {
            dark_ink
        } else {
            Hex::new(0xfffaf5)
        };
        let success = old.green_glow.as_deref().and_then(color);
        let warning = old.amber_glow.as_deref().and_then(color);
        let mut theme = base.clone();
        theme.id = old.name.trim().to_ascii_lowercase();
        theme.name = old.label.trim().to_owned();
        theme.description = old.tagline.unwrap_or_else(|| "Imported color theme".into());
        theme.density = self.density;
        for p in [&mut theme.colors.light, &mut theme.colors.dark] {
            let surfaces = [p.background, p.navigation, p.raised, p.subtle, p.hover];
            let readable = |candidate: Hex| {
                surfaces
                    .iter()
                    .all(|surface| candidate.contrast(*surface) >= 4.5)
            };
            p.accent = primary;
            p.accent_ink = accent_ink;
            p.accent_hover = (accent_ink.contrast(secondary) >= 4.5).then_some(secondary);
            if readable(primary) {
                p.accent_text = primary;
            }
            if let Some(success) = success.filter(|candidate| readable(*candidate)) {
                p.success = success;
            }
            if let Some(warning) = warning.filter(|candidate| readable(*candidate)) {
                p.warning = warning;
            }
        }
        theme.code_colors = Some(ModeColors {
            light: CodeColors {
                background: theme.colors.light.raised,
                text: theme.colors.light.text,
            },
            dark: CodeColors {
                background: old
                    .panel_bg
                    .as_deref()
                    .and_then(color)
                    .or_else(|| old.base_bg.as_deref().and_then(color))
                    .unwrap_or(Hex::new(0x080706)),
                text: old
                    .base_fg
                    .as_deref()
                    .and_then(color)
                    .unwrap_or(theme.colors.dark.text),
            },
        });
        theme.terminal_colors = Some(TerminalColors {
            blue: primary,
            bright_blue: secondary,
            cyan: old
                .cyan_glow
                .as_deref()
                .and_then(color)
                .unwrap_or(secondary),
            magenta: old
                .magenta_glow
                .as_deref()
                .and_then(color)
                .unwrap_or(secondary),
            muted: old.muted.as_deref().and_then(color),
        });
        Ok(Bundle {
            kind: BUNDLE_KIND.into(),
            version: 2,
            theme,
            density: self.density,
            appearance: self.appearance,
        })
    }
}

fn color(raw: &str) -> Option<Hex> {
    if raw.len() > 240 {
        return None;
    }
    let lower = raw.trim().to_ascii_lowercase();
    let named = match lower.as_str() {
        "black" => Some(0x080706),
        "blue" => Some(0x4f7cff),
        "cyan" => Some(0x63e6ff),
        "gray" => Some(0xa0988f),
        "green" => Some(0x86b875),
        "magenta" => Some(0xff7de8),
        "orange" => Some(0xff7a00),
        "red" => Some(0xe47763),
        "white" => Some(0xf4f1eb),
        "yellow" => Some(0xe7a84d),
        _ => None,
    };
    if let Some(value) = named {
        return Some(Hex::new(value));
    }
    if let Some(hex) = lower.strip_prefix('#') {
        if !hex.bytes().all(|byte| byte.is_ascii_hexdigit()) {
            return None;
        }
        let mut expanded = String::new();
        let hex = if hex.len() == 3 || hex.len() == 4 {
            for c in hex.chars() {
                expanded.push(c);
                expanded.push(c);
            }
            expanded.as_str()
        } else {
            hex
        };
        return match hex.len() {
            6 => u32::from_str_radix(hex, 16).ok().map(Hex::new),
            8 if hex.ends_with("ff") => u32::from_str_radix(&hex[..6], 16).ok().map(Hex::new),
            _ => None,
        };
    }
    let (function, list) = lower.split_once('(')?;
    let parts: Vec<_> = list.strip_suffix(')')?.split(',').map(str::trim).collect();
    if !matches!(function, "rgb" | "rgba" | "hsl" | "hsla")
        || parts.len() != if function.ends_with('a') { 4 } else { 3 }
    {
        return None;
    }
    if parts.get(3).map_or(Some(1.), |alpha| channel(alpha, 1.))? != 1. {
        return None;
    }
    let channels = if function.starts_with("rgb") {
        [
            channel(parts[0], 255.)?,
            channel(parts[1], 255.)?,
            channel(parts[2], 255.)?,
        ]
    } else {
        hsl(&parts)?
    };
    if channels.iter().any(|n| !(0. ..=255.).contains(n)) {
        return None;
    }
    let [r, g, b] = channels.map(|n| n.round() as u32);
    Some(Hex::new((r << 16) | (g << 8) | b))
}

fn numeric(value: &str, unit: &str) -> Option<f64> {
    let value = value.strip_suffix(unit)?;
    if !value
        .trim_start_matches(['+', '-'])
        .bytes()
        .all(|b| b.is_ascii_digit() || b == b'.')
    {
        return None;
    }
    value.parse::<f64>().ok()
}

fn channel(value: &str, scale: f64) -> Option<f64> {
    if value.ends_with('%') {
        Some(numeric(value, "%")? * scale / 100.)
    } else {
        numeric(value, "")
    }
}

fn hsl(parts: &[&str]) -> Option<[f64; 3]> {
    let h = numeric(parts[0], if parts[0].ends_with("deg") { "deg" } else { "" })?.rem_euclid(360.)
        / 60.;
    let s = numeric(parts[1], "%")? / 100.;
    let l = numeric(parts[2], "%")? / 100.;
    if !(h.is_finite() && (0. ..=1.).contains(&s) && (0. ..=1.).contains(&l)) {
        return None;
    }
    let chroma = (1. - (2. * l - 1.).abs()) * s;
    let x = chroma * (1. - (h % 2. - 1.).abs());
    let channels = match h as u8 {
        0 => [chroma, x, 0.],
        1 => [x, chroma, 0.],
        2 => [0., chroma, x],
        3 => [0., x, chroma],
        4 => [x, 0., chroma],
        _ => [chroma, 0., x],
    };
    Some(channels.map(|n| (n + l - chroma / 2.) * 255.))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_supported_opaque_legacy_colors() {
        for rgba in [
            "#39af",
            "#3399aaff",
            "rgba(51,153,170,100%)",
            "hsl(188.57142857deg,53.846154%,43.333333%)",
        ] {
            assert_eq!(color(rgba), Some(Hex::new(0x3399aa)), "{rgba}");
        }
        for dangerous in [
            "url(https://example.net)",
            "#3399aaaa",
            "rgba(0,0,0,0.8)",
            "rgb(0,-1,0)",
            "currentColor",
        ] {
            assert_eq!(color(dangerous), None, "{dangerous}");
        }
    }
}
