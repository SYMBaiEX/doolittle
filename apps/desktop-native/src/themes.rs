mod legacy;
mod panel;
mod schema;

pub use panel::appearance_panel;

use std::{
    borrow::Cow,
    fs::{self, OpenOptions},
    io::Write,
    path::PathBuf,
    sync::{Arc, LazyLock},
};

use anyhow::{Context as _, Result};
use directories::ProjectDirs;
use gpui::{
    App, AssetSource, BoxShadow, Div, Global, Hsla, ObjectFit, ParentElement, Pixels, Rgba,
    SharedString, Styled, StyledImage, Window, WindowBackgroundAppearance, div, img,
    linear_color_stop, linear_gradient, pattern_slash, point, px, rgb,
};
use gpui_component::{Theme, ThemeMode, highlighter::HighlightTheme};
use schema::{
    Appearance, BUNDLE_KIND, BodyFont, Bundle, Density, Geometry, Layout, Manifest, Material,
};
use uuid::Uuid;

const BRIDGE_PATH: &str = "theme-assets/golden-gate-landscape.svg";
const BRIDGE: &[u8] = include_bytes!("../assets/golden-gate-landscape.svg");
const BANGERS: &[u8] = include_bytes!("../assets/Bangers-Regular.ttf");
const BUILTIN_JSON: &str = include_str!("../assets/builtin-themes.json");

static BUILTINS: LazyLock<Vec<Manifest>> = LazyLock::new(|| {
    serde_json::from_str(BUILTIN_JSON).expect("desktop built-in theme definitions must be valid")
});

#[derive(Clone)]
struct ThemeState {
    active: Bundle,
    system_mode: ThemeMode,
    has_comic_font: bool,
    importing: bool,
    feedback: Option<(String, bool)>,
}

impl Global for ThemeState {}

pub struct ThemeAssets;

impl AssetSource for ThemeAssets {
    fn load(&self, path: &str) -> gpui::Result<Option<Cow<'static, [u8]>>> {
        Ok((path == BRIDGE_PATH).then_some(Cow::Borrowed(BRIDGE)))
    }

    fn list(&self, path: &str) -> gpui::Result<Vec<SharedString>> {
        Ok(if path == "theme-assets" {
            vec![BRIDGE_PATH.into()]
        } else {
            Vec::new()
        })
    }
}

pub fn initialize(cx: &mut App) {
    let mut active = default_bundle();
    let mut feedback = None;
    if let Ok(path) = preference_path()
        && path.exists()
    {
        match schema::read_bundle(&path) {
            Ok(bundle) => active = bundle,
            Err(_) => {
                feedback = Some((
                    "Saved theme could not be read. Companion is active.".into(),
                    true,
                ))
            }
        }
    }
    let system_mode = cx.window_appearance().into();
    cx.set_global(ThemeState {
        active,
        system_mode,
        has_comic_font: cx
            .text_system()
            .add_fonts(vec![Cow::Borrowed(BANGERS)])
            .is_ok(),
        importing: false,
        feedback,
    });
    apply(None, cx);
}

pub fn observe_window(window: &mut Window, cx: &mut App) {
    refresh_window_material(window, cx);
    window
        .observe_window_appearance(|window, cx| {
            let observed = window.appearance().into();
            if cx.global::<ThemeState>().system_mode != observed {
                cx.global_mut::<ThemeState>().system_mode = observed;
                if cx.global::<ThemeState>().active.appearance == Appearance::System {
                    apply(Some(window), cx);
                }
            }
        })
        .detach();
}

fn refresh_window_material(window: &mut Window, cx: &App) {
    window.set_background_appearance(
        if cx.global::<ThemeState>().active.theme.material == Material::Glass {
            WindowBackgroundAppearance::Blurred
        } else {
            WindowBackgroundAppearance::Opaque
        },
    );
}

fn default_bundle() -> Bundle {
    Bundle {
        kind: BUNDLE_KIND.into(),
        version: 2,
        theme: BUILTINS[0].clone(),
        appearance: Appearance::System,
        density: Density::Comfortable,
    }
}

fn preference_path() -> Result<PathBuf> {
    ProjectDirs::from("", "Doolittle", "Doolittle Native")
        .map(|dirs| dirs.config_dir().join("appearance.json"))
        .context("Could not find the user configuration directory.")
}

fn store(bundle: &Bundle) -> Result<()> {
    let path = preference_path()?;
    let parent = path
        .parent()
        .context("Missing native preference directory.")?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".appearance-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(bundle)?)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, &path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

fn change(bundle: Bundle, window: Option<&mut Window>, cx: &mut App) {
    let feedback = store(&bundle).err().map(|_| {
        (
            "Appearance changed, but the preference could not be saved.".into(),
            true,
        )
    });
    cx.global_mut::<ThemeState>().active = bundle;
    cx.global_mut::<ThemeState>().feedback = feedback;
    apply(window, cx);
}

fn apply(window: Option<&mut Window>, cx: &mut App) {
    let state = cx.global::<ThemeState>();
    let mode = match state.active.appearance {
        Appearance::Dark => ThemeMode::Dark,
        Appearance::Light => ThemeMode::Light,
        Appearance::System => state.system_mode,
    };
    let colors = Palette::from_manifest(
        &state.active.theme,
        mode.is_dark(),
        state.active.density,
        state.has_comic_font,
    );
    Theme::change(mode, None, cx);
    let theme = Theme::global_mut(cx);
    theme.font_family = colors.body_family().into();
    theme.font_size = colors.conversation_size();
    theme.radius = colors.control_radius();
    theme.radius_lg = colors.composer_radius();
    theme.background = colors.canvas.into();
    theme.foreground = colors.text.into();
    theme.border = colors.divider.into();
    theme.input = colors.divider.into();
    theme.accent = colors.hover.into();
    theme.accent_foreground = colors.text.into();
    theme.primary = colors.accent.into();
    theme.primary_hover = colors.accent_hover.into();
    theme.primary_active = colors.accent_hover.into();
    theme.primary_foreground = colors.accent_ink.into();
    theme.secondary = colors.inset.into();
    theme.secondary_hover = colors.hover.into();
    theme.secondary_active = colors.hover.into();
    theme.secondary_foreground = colors.text.into();
    theme.muted = colors.inset.into();
    theme.muted_foreground = colors.muted.into();
    theme.caret = colors.text.into();
    theme.ring = colors.accent_text.into();
    theme.link = colors.accent_text.into();
    theme.link_active = colors.accent_text.into();
    theme.link_hover = colors.accent_text.into();
    theme.selection = Hsla::from(colors.accent).opacity(0.28);
    theme.popover = colors.raised.into();
    theme.popover_foreground = colors.text.into();
    theme.sidebar = colors.rail.into();
    theme.sidebar_accent = colors.hover.into();
    theme.sidebar_accent_foreground = colors.text.into();
    theme.sidebar_border = colors.divider.into();
    theme.sidebar_foreground = colors.text.into();
    theme.sidebar_primary = colors.accent.into();
    theme.sidebar_primary_foreground = colors.accent_ink.into();
    theme.title_bar = colors.rail.into();
    theme.title_bar_border = colors.divider.into();
    theme.list = colors.raised.into();
    theme.list_hover = colors.hover.into();
    theme.list_active = colors.inset.into();
    theme.list_active_border = colors.divider.into();
    theme.list_head = colors.inset.into();
    theme.table = colors.raised.into();
    theme.table_hover = colors.hover.into();
    theme.table_head = colors.inset.into();
    theme.table_head_foreground = colors.text.into();
    theme.table_row_border = colors.divider.into();
    theme.tab = colors.rail.into();
    theme.tab_active = colors.inset.into();
    theme.tab_foreground = colors.muted.into();
    theme.tab_active_foreground = colors.text.into();
    theme.tab_bar = colors.rail.into();
    theme.tab_bar_segmented = colors.inset.into();
    theme.chart_1 = colors.accent.into();
    theme.chart_2 = colors.positive.into();
    theme.chart_3 = colors.warning.into();
    theme.chart_4 = colors.danger.into();
    theme.chart_5 = colors.muted.into();
    theme.success = colors.positive.into();
    theme.warning = colors.warning.into();
    theme.danger = colors.danger.into();
    // Code surfaces use the same theme manifest as chat and settings while
    // retaining GPUI's language-aware syntax tokens.
    theme.highlight_theme = if mode.is_dark() {
        HighlightTheme::default_dark()
    } else {
        HighlightTheme::default_light()
    };
    let highlight = Arc::make_mut(&mut theme.highlight_theme);
    highlight.style.editor_background = Some(colors.editor.into());
    highlight.style.editor_foreground = Some(colors.editor_text.into());
    if let Some(window) = window {
        refresh_window_material(window, cx);
        window.refresh();
    }
    cx.refresh_windows();
    let windows = cx.windows();
    for handle in windows {
        let _ = handle.update(cx, |_, window, cx| refresh_window_material(window, cx));
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Surface {
    Navigation,
    Header,
    Panel,
    Composer,
    Message,
    Control,
    Editor,
}

#[derive(Clone, Copy)]
pub struct Palette {
    pub canvas: Rgba,
    pub rail: Rgba,
    pub inset: Rgba,
    pub raised: Rgba,
    pub divider: Rgba,
    pub text: Rgba,
    pub muted: Rgba,
    pub accent: Rgba,
    pub accent_ink: Rgba,
    pub positive: Rgba,
    pub danger: Rgba,
    pub warning: Rgba,
    pub accent_text: Rgba,
    pub editor: Rgba,
    pub editor_text: Rgba,
    hover: Rgba,
    accent_hover: Rgba,
    strong: Rgba,
    dark: bool,
    density: Density,
    material: Material,
    layout: Layout,
    body_font: BodyFont,
    comic_font: bool,
    geometry: Geometry,
    row: f32,
    page: f32,
    conversation: f32,
    control: f32,
    metadata: f32,
    line_height: f32,
}

impl Palette {
    pub fn current(cx: &App) -> Self {
        let state = cx.global::<ThemeState>();
        Self::from_manifest(
            &state.active.theme,
            Theme::global(cx).is_dark(),
            state.active.density,
            state.has_comic_font,
        )
    }

    fn from_manifest(theme: &Manifest, dark: bool, density: Density, comic_font: bool) -> Self {
        let c = theme.colors.for_mode(dark);
        let editor = theme.code_colors.as_ref().map(|pair| pair.for_mode(dark));
        Self {
            canvas: c.background.rgb(),
            rail: c.navigation.rgb(),
            inset: c.subtle.rgb(),
            raised: c.raised.rgb(),
            divider: c.border.rgb(),
            text: c.text.rgb(),
            muted: c.muted_text.rgb(),
            accent: c.accent.rgb(),
            accent_ink: c.accent_ink.rgb(),
            positive: c.success.rgb(),
            danger: c.error.rgb(),
            warning: c.warning.rgb(),
            accent_text: c.accent_text.rgb(),
            editor: editor.map_or(c.raised, |color| color.background).rgb(),
            editor_text: editor.map_or(c.text, |color| color.text).rgb(),
            hover: c.hover.rgb(),
            accent_hover: c.accent_hover.unwrap_or(c.accent).rgb(),
            strong: c.border_strong.rgb(),
            dark,
            density,
            material: theme.material,
            layout: theme.layout,
            body_font: theme.typography.body_font,
            comic_font,
            geometry: theme.geometry,
            row: theme.spacing.row,
            page: theme.spacing.page,
            conversation: theme.typography.conversation_size,
            control: theme.typography.control_size,
            metadata: theme.typography.metadata_size,
            line_height: theme.typography.line_height,
        }
    }

    pub fn body_family(&self) -> &'static str {
        let system = ".SystemUIFont";
        match self.body_font {
            BodyFont::System => system,
            BodyFont::Avenir if cfg!(target_os = "macos") => "Avenir Next",
            BodyFont::Humanist if cfg!(target_os = "macos") => "Optima",
            BodyFont::Monospace => {
                if cfg!(target_os = "macos") {
                    "Menlo"
                } else if cfg!(target_os = "windows") {
                    "Consolas"
                } else {
                    "DejaVu Sans Mono"
                }
            }
            _ => system,
        }
    }

    pub fn display_family(&self) -> &'static str {
        if self.material == Material::Cel && self.comic_font {
            "Bangers"
        } else {
            self.body_family()
        }
    }

    pub fn control_radius(&self) -> Pixels {
        px(self.geometry.control_radius)
    }
    pub fn composer_radius(&self) -> Pixels {
        px(self.geometry.composer_radius)
    }
    pub fn reading_width(&self) -> Pixels {
        px(self.geometry.reading_width)
    }
    pub fn navigation_width(&self) -> Pixels {
        px(self.geometry.navigation_width)
    }
    pub fn header_height(&self) -> Pixels {
        px(if self.density == Density::Compact {
            self.geometry.header_height - 8.
        } else {
            self.geometry.header_height
        })
    }
    pub fn control_height(&self) -> Pixels {
        px(if self.density == Density::Compact {
            self.geometry.control_height - 4.
        } else {
            self.geometry.control_height
        })
    }
    pub fn row_space(&self) -> Pixels {
        px(if self.density == Density::Compact {
            self.row - 2.
        } else {
            self.row
        })
    }
    pub fn page_space(&self) -> Pixels {
        px(self.page)
    }
    pub fn conversation_size(&self) -> Pixels {
        px(self.conversation)
    }
    pub fn control_size(&self) -> Pixels {
        px(self.control)
    }
    pub fn metadata_size(&self) -> Pixels {
        px(self.metadata)
    }
    pub fn line_height(&self) -> Pixels {
        px(self.conversation * self.line_height)
    }
    pub fn compact_navigation(&self) -> bool {
        self.layout == Layout::Canvas
    }

    pub fn frame_gap(&self) -> Pixels {
        px(match self.material {
            Material::Flat => 0.,
            Material::Cel => 8.,
            Material::Glass => 12.,
        })
    }

    pub fn has_panel_material(&self) -> bool {
        self.material != Material::Flat
    }

    pub fn canvas_backdrop(&self) -> Div {
        let fill = div().absolute().inset_0().overflow_hidden().bg(self.canvas);
        match self.material {
            Material::Flat => fill,
            Material::Cel => fill.child(div().absolute().inset_0().bg(pattern_slash(
                Hsla::from(self.text).opacity(if self.dark { 0.07 } else { 0.09 }),
                1.,
                7.,
            ))),
            Material::Glass => fill
                .child(
                    img(BRIDGE_PATH)
                        .absolute()
                        .inset_0()
                        .size_full()
                        .object_fit(ObjectFit::Cover),
                )
                .child(
                    div().absolute().inset_0().bg(linear_gradient(
                        135.,
                        linear_color_stop(
                            Hsla::from(if self.dark {
                                rgb(0x141c3e)
                            } else {
                                rgb(0xc3d9ff)
                            })
                            .opacity(0.54),
                            0.,
                        ),
                        linear_color_stop(
                            Hsla::from(if self.dark {
                                rgb(0x101728)
                            } else {
                                rgb(0xc9dbff)
                            })
                            .opacity(0.17),
                            1.,
                        ),
                    )),
                ),
        }
    }

    pub fn surface(&self, element: Div, role: Surface) -> Div {
        let fill = match role {
            Surface::Navigation | Surface::Header => self.rail,
            Surface::Panel => self.canvas,
            Surface::Editor => self.editor,
            Surface::Control => self.inset,
            Surface::Composer | Surface::Message => self.raised,
        };
        let rounded = match role {
            Surface::Composer => self.composer_radius(),
            Surface::Message | Surface::Control => self.control_radius(),
            _ => px(0.),
        };
        if role == Surface::Editor {
            return element.bg(fill);
        }
        match self.material {
            Material::Flat => element.bg(fill).rounded(rounded),
            Material::Cel => {
                let edge = if role == Surface::Control { 1. } else { 2. };
                let offset = if role == Surface::Control { 2. } else { 4. };
                element
                    .bg(fill)
                    .rounded(px(1.))
                    .border(px(edge))
                    .border_color(self.strong)
                    .shadow(vec![BoxShadow {
                        color: self.strong.into(),
                        offset: point(px(offset), px(offset)),
                        blur_radius: px(0.),
                        spread_radius: px(0.),
                    }])
            }
            Material::Glass => {
                let size = match role {
                    Surface::Header => 16.,
                    Surface::Navigation | Surface::Panel => 22.,
                    Surface::Message => 20.,
                    Surface::Composer => self.geometry.composer_radius,
                    _ => self.geometry.control_radius,
                };
                let base = Hsla::from(fill);
                let upper = if self.dark {
                    base.opacity(0.91)
                } else {
                    Hsla::from(rgb(0xffffff)).opacity(0.83)
                };
                element
                    .bg(linear_gradient(
                        145.,
                        linear_color_stop(upper, 0.),
                        linear_color_stop(base.opacity(if self.dark { 0.96 } else { 0.87 }), 1.),
                    ))
                    .rounded(px(size))
                    .border_1()
                    .border_color(
                        Hsla::from(if self.dark {
                            rgb(0xd1e4ff)
                        } else {
                            rgb(0xffffff)
                        })
                        .opacity(0.76),
                    )
                    .shadow(vec![
                        BoxShadow {
                            color: Hsla::from(rgb(0xffffff)).opacity(if self.dark {
                                0.12
                            } else {
                                0.50
                            }),
                            offset: point(px(0.), px(-1.)),
                            blur_radius: px(0.),
                            spread_radius: px(0.),
                        },
                        BoxShadow {
                            color: Hsla::from(rgb(0x102246)).opacity(if self.dark {
                                0.43
                            } else {
                                0.20
                            }),
                            offset: point(px(0.), px(8.)),
                            blur_radius: px(22.),
                            spread_radius: px(0.),
                        },
                    ])
            }
        }
    }
}
