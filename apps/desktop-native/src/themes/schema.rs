use std::{fs::File, io::Read, path::Path};

use super::{BUILTINS, legacy::LegacyBundle};
use anyhow::{Result, bail, ensure};
use gpui::{Rgba, rgb};
use serde::{Deserialize, Serialize, de::Error as _};

pub const MAX_THEME_BYTES: u64 = 64 * 1024;
pub const BUNDLE_KIND: &str = "doolittle.theme.bundle";

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Appearance {
    Dark,
    Light,
    #[default]
    System,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Density {
    Compact,
    #[default]
    Comfortable,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Material {
    #[default]
    Flat,
    Cel,
    Glass,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Layout {
    Companion,
    Canvas,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum BodyFont {
    System,
    Avenir,
    Humanist,
    Monospace,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
enum CodeFont {
    #[serde(rename = "monospace")]
    Monospace,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
enum ReducedMotion {
    #[serde(rename = "respect-system")]
    RespectSystem,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Hex(u32);

impl Hex {
    pub const fn new(value: u32) -> Self {
        Self(value)
    }

    pub fn rgb(self) -> Rgba {
        rgb(self.0)
    }

    pub(super) fn mix(self, other: Self, amount: f64) -> Self {
        let channel = |shift| {
            let original = f64::from((self.0 >> shift) & 0xffu32);
            let target = f64::from((other.0 >> shift) & 0xffu32);
            (original + (target - original) * amount).round() as u32
        };
        Self::new((channel(16) << 16) | (channel(8) << 8) | channel(0))
    }

    fn luminance(self) -> f64 {
        let [r, g, b] = [16, 8, 0].map(|shift| {
            let n = f64::from((self.0 >> shift) & 0xff) / 255.;
            if n <= 0.04045 {
                n / 12.92
            } else {
                ((n + 0.055) / 1.055).powf(2.4)
            }
        });
        r * 0.2126 + g * 0.7152 + b * 0.0722
    }

    pub fn contrast(self, other: Self) -> f64 {
        let a = self.luminance();
        let b = other.luminance();
        (a.max(b) + 0.05) / (a.min(b) + 0.05)
    }
}

impl<'de> Deserialize<'de> for Hex {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(deserializer)?;
        let value = raw
            .strip_prefix('#')
            .filter(|hex| hex.len() == 6 && hex.bytes().all(|byte| byte.is_ascii_hexdigit()));
        value
            .and_then(|hex| u32::from_str_radix(hex, 16).ok())
            .map(Self)
            .ok_or_else(|| D::Error::custom("theme colors must use #rrggbb"))
    }
}

impl Serialize for Hex {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&format!("#{:06x}", self.0))
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SemanticPalette {
    pub background: Hex,
    pub navigation: Hex,
    pub raised: Hex,
    pub subtle: Hex,
    pub hover: Hex,
    pub border: Hex,
    pub border_strong: Hex,
    pub text: Hex,
    pub secondary_text: Hex,
    pub muted_text: Hex,
    pub accent: Hex,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_hover: Option<Hex>,
    pub accent_ink: Hex,
    pub accent_text: Hex,
    pub success: Hex,
    pub warning: Hex,
    pub error: Hex,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ModeColors<T> {
    pub dark: T,
    pub light: T,
}

impl<T> ModeColors<T> {
    pub fn for_mode(&self, dark: bool) -> &T {
        if dark { &self.dark } else { &self.light }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CodeColors {
    pub background: Hex,
    pub text: Hex,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct TerminalColors {
    pub blue: Hex,
    pub bright_blue: Hex,
    pub cyan: Hex,
    pub magenta: Hex,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub muted: Option<Hex>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Typography {
    pub body_font: BodyFont,
    code_font: CodeFont,
    pub conversation_size: f32,
    pub control_size: f32,
    pub metadata_size: f32,
    pub line_height: f32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Spacing {
    pub unit: f32,
    pub row: f32,
    pub page: f32,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Geometry {
    pub navigation_width: f32,
    pub inspector_width: f32,
    pub reading_width: f32,
    pub control_radius: f32,
    pub composer_radius: f32,
    pub control_height: f32,
    pub touch_height: f32,
    pub header_height: f32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Motion {
    duration_ms: f32,
    reduced_motion: ReducedMotion,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Manifest {
    kind: String,
    version: u8,
    pub id: String,
    pub name: String,
    pub description: String,
    pub layout: Layout,
    #[serde(default)]
    pub material: Material,
    pub colors: ModeColors<SemanticPalette>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_colors: Option<ModeColors<CodeColors>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub terminal_colors: Option<TerminalColors>,
    pub typography: Typography,
    pub spacing: Spacing,
    pub geometry: Geometry,
    pub density: Density,
    motion: Motion,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Bundle {
    pub kind: String,
    pub version: u8,
    pub theme: Manifest,
    pub appearance: Appearance,
    pub density: Density,
}

pub fn parse_bundle(bytes: &[u8]) -> Result<Bundle> {
    ensure!(
        bytes.len() as u64 <= MAX_THEME_BYTES,
        "Theme files must be 64 KB or smaller."
    );
    let mut bundle: Bundle = match serde_json::from_slice(bytes) {
        Ok(bundle) => bundle,
        Err(_) => serde_json::from_slice::<LegacyBundle>(bytes)
            .map_err(|_| anyhow::anyhow!("Select a valid Doolittle theme bundle."))?
            .migrate(&BUILTINS[0])?,
    };
    ensure!(
        bundle.kind == BUNDLE_KIND && bundle.version == 2,
        "Unsupported theme bundle version."
    );
    bundle.theme.name = bundle.theme.name.trim().to_owned();
    bundle.theme.validate()?;
    Ok(bundle)
}

pub fn read_bundle(path: &Path) -> Result<Bundle> {
    // Reject nonregular files before opening the file picker result. The bounded
    // read also handles a regular file that grows after the metadata check.
    let metadata = path.metadata()?;
    ensure!(metadata.is_file(), "Select a regular theme file.");
    ensure!(
        metadata.len() <= MAX_THEME_BYTES,
        "Theme files must be 64 KB or smaller."
    );
    let mut bytes = Vec::new();
    File::open(path)?
        .take(MAX_THEME_BYTES + 1)
        .read_to_end(&mut bytes)?;
    parse_bundle(&bytes)
}

impl Manifest {
    fn validate(&self) -> Result<()> {
        let id = self.id.as_bytes();
        ensure!(
            self.kind == "doolittle.theme"
                && self.version == 2
                && (1..=64).contains(&id.len())
                && (id[0].is_ascii_lowercase() || id[0].is_ascii_digit())
                && id
                    .iter()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"._-".contains(b))
                && (1..=80).contains(&self.name.chars().count())
                && self.description.chars().count() <= 240
                && !self
                    .name
                    .chars()
                    .chain(self.description.chars())
                    .any(char::is_control),
            "Invalid theme identity or description."
        );
        let t = &self.typography;
        let s = &self.spacing;
        let g = &self.geometry;
        for (value, min, max) in [
            (t.conversation_size, 16., 22.),
            (t.control_size, 14., 18.),
            (t.metadata_size, 12., 16.),
            (t.line_height, 1.4, 1.8),
            (s.unit, 4., 8.),
            (s.row, 6., 20.),
            (s.page, 12., 40.),
            (g.navigation_width, 212., 360.),
            (g.inspector_width, 280., 480.),
            (g.reading_width, 640., 1100.),
            (g.control_radius, 0., 16.),
            (g.composer_radius, 0., 24.),
            (g.control_height, 40., 52.),
            (g.touch_height, 44., 60.),
            (g.header_height, 48., 64.),
            (self.motion.duration_ms, 0., 200.),
        ] {
            if !(min..=max).contains(&value) {
                bail!(
                    "Theme typography, spacing, geometry, or motion is outside the supported range."
                );
            }
        }
        for palette in [&self.colors.dark, &self.colors.light] {
            for background in [
                palette.background,
                palette.navigation,
                palette.raised,
                palette.subtle,
                palette.hover,
            ] {
                for foreground in [
                    palette.text,
                    palette.secondary_text,
                    palette.muted_text,
                    palette.accent_text,
                ] {
                    ensure!(
                        foreground.contrast(background) >= 4.5,
                        "Theme text requires 4.5:1 contrast."
                    );
                }
            }
            for fill in [Some(palette.accent), palette.accent_hover]
                .into_iter()
                .flatten()
            {
                ensure!(
                    palette.accent_ink.contrast(fill) >= 4.5,
                    "Theme primary controls require 4.5:1 contrast."
                );
            }
        }
        if let Some(colors) = &self.code_colors {
            for code in [&colors.light, &colors.dark] {
                ensure!(
                    code.text.contrast(code.background) >= 4.5,
                    "Theme code text requires 4.5:1 contrast."
                );
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_shipped_style_round_trips_in_both_appearances() {
        let ids: Vec<_> = BUILTINS.iter().map(|theme| theme.id.as_str()).collect();
        assert_eq!(
            ids,
            [
                "companion",
                "canvas",
                "anime-atelier",
                "golden-gate-glass",
                "orange",
                "blue",
                "matrix",
                "synthwave",
                "ember",
                "arctic",
                "toxic",
                "rose",
                "obsidian",
                "ivory",
            ],
        );
        for theme in BUILTINS.iter() {
            for appearance in [Appearance::Dark, Appearance::Light, Appearance::System] {
                let bundle = Bundle {
                    kind: BUNDLE_KIND.into(),
                    version: 2,
                    theme: theme.clone(),
                    appearance,
                    density: Density::Compact,
                };
                let parsed = parse_bundle(&serde_json::to_vec(&bundle).unwrap())
                    .unwrap_or_else(|err| panic!("{}: {err}", theme.id));
                assert_eq!(theme, &parsed.theme);
                assert_eq!(appearance, parsed.appearance);
                assert_eq!(Density::Compact, parsed.density);
            }
        }
    }

    #[test]
    fn rejects_theme_injection_and_unreadable_colors() {
        let bundle = super::super::default_bundle();
        let mut json = serde_json::to_value(&bundle).unwrap();
        json["theme"]["stylesheet"] = serde_json::json!("body { visibility: hidden; }");
        assert!(parse_bundle(&serde_json::to_vec(&json).unwrap()).is_err());
        let mut json = serde_json::to_value(&bundle).unwrap();
        json["theme"]["colors"]["light"]["text"] = serde_json::json!("#fdfbf8");
        assert!(parse_bundle(&serde_json::to_vec(&json).unwrap()).is_err());
        assert!(parse_bundle(&vec![b' '; MAX_THEME_BYTES as usize + 1]).is_err());
    }

    #[test]
    fn imports_existing_legacy_desktop_bundles_as_current_manifests() {
        let fixture = br##"{
            "kind":"doolittle.theme","version":1,"appearance":"dark","density":"compact",
            "theme":{"name":"old-terminal","label":"Old terminal","primary":"#ff6a00","secondary":"orange","baseBg":"black","baseFg":"white"}
        }"##;
        let bundle = parse_bundle(fixture).unwrap();
        assert_eq!(bundle.kind, BUNDLE_KIND);
        assert_eq!(bundle.theme.id, "old-terminal");
        assert_eq!(bundle.theme.material, Material::Flat);
        assert_eq!(bundle.appearance, Appearance::Dark);
        assert_eq!(bundle.density, Density::Compact);
        assert_eq!(bundle.theme.colors.dark.accent, Hex::new(0xff6a00));
    }
}
