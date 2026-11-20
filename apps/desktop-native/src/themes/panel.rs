use std::{fs::OpenOptions, io::Write, path::PathBuf};

use directories::UserDirs;
use gpui::{
    AnyElement, App, Div, FontWeight, Hsla, IntoElement, ParentElement, PathPromptOptions, Styled,
    div, prelude::*, px,
};
use gpui_component::{Disableable, Selectable, Sizable, button::Button};

use super::{BUILTINS, Palette, Surface, ThemeState, change, schema};
use schema::{Appearance, Density, Manifest};

pub fn appearance_panel(cx: &App) -> AnyElement {
    let state = cx.global::<ThemeState>();
    let colors = Palette::current(cx);
    let appearance = state.active.appearance;
    let density = state.active.density;
    let dark = gpui_component::Theme::global(cx).is_dark();

    let modes = div().flex().flex_wrap().gap_2().children(
        [
            (Appearance::System, "System"),
            (Appearance::Light, "Light"),
            (Appearance::Dark, "Dark"),
        ]
        .into_iter()
        .map(|(mode, label)| {
            option(
                ("appearance-mode", label),
                label,
                appearance == mode,
                state.importing,
                colors,
            )
            .on_click(move |_, window, cx| {
                let mut bundle = cx.global::<ThemeState>().active.clone();
                if bundle.appearance != mode {
                    bundle.appearance = mode;
                    change(bundle, Some(window), cx);
                }
            })
        }),
    );
    let densities = div().flex().flex_wrap().gap_2().children(
        [
            (Density::Comfortable, "Comfortable"),
            (Density::Compact, "Compact"),
        ]
        .into_iter()
        .map(|(value, label)| {
            option(
                ("appearance-density", label),
                label,
                density == value,
                state.importing,
                colors,
            )
            .on_click(move |_, window, cx| {
                let mut bundle = cx.global::<ThemeState>().active.clone();
                if bundle.density != value {
                    bundle.density = value;
                    change(bundle, Some(window), cx);
                }
            })
        }),
    );

    // The custom manifest is stored as semantic data, never as an asset or
    // stylesheet. Keep the selection distinguishable if it shares a built-in ID.
    let imported = !BUILTINS.iter().any(|built| built == &state.active.theme);
    let selected = state.active.theme.id.as_str();
    let previews = div()
        .flex()
        .flex_wrap()
        .gap_3()
        .children(BUILTINS.iter().enumerate().map(|(index, theme)| {
            choice(
                ("builtin-theme", index),
                theme,
                !imported && selected == theme.id,
                state.importing,
                colors,
                dark,
            )
            .on_click(move |_, window, cx| {
                let mut bundle = cx.global::<ThemeState>().active.clone();
                if bundle.theme != BUILTINS[index] {
                    bundle.theme = BUILTINS[index].clone();
                    change(bundle, Some(window), cx);
                }
            })
        }))
        .when(imported, |node| {
            node.child(
                choice(
                    ("custom-theme", 0),
                    &state.active.theme,
                    true,
                    state.importing,
                    colors,
                    dark,
                )
                .on_click(|_, _, _| {}),
            )
        });
    div()
        .flex()
        .flex_col()
        .gap(colors.page_space())
        .p(colors.page_space())
        .child(field("Color mode", modes, colors))
        .child(field("Interface density", densities, colors))
        .child(
            div()
                .flex()
                .flex_col()
                .gap_2()
                .child(
                    div()
                        .font_weight(FontWeight::SEMIBOLD)
                        .text_size(colors.control_size())
                        .child("Interface theme"),
                )
                .child(previews),
        )
        .child(
            div()
                .flex()
                .flex_wrap()
                .gap_2()
                .child(
                    Button::new("appearance-import")
                        .outline()
                        .label("Import theme")
                        .disabled(state.importing)
                        .on_click(|_, _, cx| import_theme(cx)),
                )
                .child(
                    Button::new("appearance-export")
                        .outline()
                        .label("Export current theme")
                        .disabled(state.importing)
                        .on_click(|_, _, cx| export_theme(cx)),
                ),
        )
        .when(state.importing, |node| {
            node.child(div().text_color(colors.muted).child("Opening theme…"))
        })
        .when_some(state.feedback.clone(), |node, (message, failed)| {
            node.child(
                div()
                    .text_color(if failed { colors.danger } else { colors.text })
                    .child(message),
            )
        })
        .into_any_element()
}

fn option(
    id: (&'static str, &'static str),
    label: &'static str,
    selected: bool,
    disabled: bool,
    colors: Palette,
) -> Button {
    Button::new(gpui::SharedString::from(format!("{}-{}", id.0, id.1)))
        .small()
        .outline()
        .min_h(colors.control_height())
        .label(if selected {
            format!("{label} (Selected)")
        } else {
            label.into()
        })
        .selected(selected)
        .disabled(disabled)
}

fn field(label: &'static str, contents: Div, colors: Palette) -> Div {
    colors.surface(
        div()
            .flex()
            .flex_col()
            .gap(colors.row_space())
            .p_3()
            .child(
                div()
                    .font_weight(FontWeight::SEMIBOLD)
                    .text_size(colors.control_size())
                    .child(label),
            )
            .child(contents),
        Surface::Panel,
    )
}

fn choice(
    id: (&'static str, usize),
    theme: &Manifest,
    selected: bool,
    disabled: bool,
    colors: Palette,
    dark: bool,
) -> Button {
    let preview = Palette::from_manifest(theme, dark, theme.density, colors.comic_font);
    Button::new(id)
        .outline()
        .selected(selected)
        .disabled(disabled)
        .tooltip(if selected {
            format!("{} (Selected)", theme.name)
        } else {
            theme.name.clone()
        })
        .w(px(200.))
        .h(px(134.))
        .child(
            div()
                .flex()
                .flex_col()
                .w_full()
                .items_start()
                .gap_2()
                .child(preview_tile(preview))
                .child(
                    div()
                        .text_size(px(15.))
                        .font_family(preview.display_family())
                        .font_weight(FontWeight::SEMIBOLD)
                        .child(theme.name.clone()),
                )
                .child(
                    div()
                        .text_color(colors.muted)
                        .text_size(colors.metadata_size())
                        .line_height(colors.line_height() * 0.8)
                        .truncate()
                        .w_full()
                        .child(if selected {
                            "Selected".to_string()
                        } else {
                            theme.description.clone()
                        }),
                ),
        )
}

fn preview_tile(preview: Palette) -> Div {
    preview.surface(
        div()
            .relative()
            .w_full()
            .h(px(54.))
            .overflow_hidden()
            .child(preview.canvas_backdrop())
            .child(
                div()
                    .absolute()
                    .inset_0()
                    .flex()
                    .items_center()
                    .gap_2()
                    .p(px(5.) + preview.frame_gap() * 0.35)
                    .when(!preview.compact_navigation(), |node| {
                        node.child(preview.surface(
                            div().w(preview.navigation_width() * 0.075).h_full(),
                            Surface::Navigation,
                        ))
                    })
                    .child(
                        div()
                            .flex()
                            .flex_1()
                            .flex_col()
                            .gap_1()
                            .when(preview.has_panel_material(), |node| {
                                preview.surface(node.px(px(5.)).py(px(3.)), Surface::Panel)
                            })
                            .child(
                                div()
                                    .w_4_5()
                                    .h(preview.header_height() * 0.08)
                                    .rounded_full()
                                    .bg(Hsla::from(preview.text).opacity(0.66)),
                            )
                            .child(
                                div()
                                    .w(px(66.))
                                    .h(px(4.))
                                    .rounded_full()
                                    .bg(Hsla::from(preview.text).opacity(0.44)),
                            )
                            .child(
                                div().flex().justify_end().child(
                                    div()
                                        .w(px(39.))
                                        .h(px(11.))
                                        .rounded(preview.control_radius())
                                        .bg(preview.accent),
                                ),
                            ),
                    ),
            ),
        Surface::Control,
    )
}

fn import_theme(cx: &mut App) {
    if cx.global::<ThemeState>().importing {
        return;
    }
    cx.global_mut::<ThemeState>().importing = true;
    cx.global_mut::<ThemeState>().feedback = None;
    cx.refresh_windows();
    let selected = cx.prompt_for_paths(PathPromptOptions {
        files: true,
        directories: false,
        multiple: false,
        prompt: Some("Import Theme".into()),
    });
    let executor = cx.background_executor().clone();
    cx.spawn(async move |cx| {
        let result = match selected.await {
            Ok(Ok(Some(paths))) => match paths.into_iter().next() {
                Some(path) => {
                    executor
                        .spawn(async move { schema::read_bundle(&path).map(Some) })
                        .await
                }
                None => Ok(None),
            },
            Ok(Ok(None)) => Ok(None),
            _ => Err(anyhow::anyhow!("The theme chooser was unavailable.")),
        };
        let _ = cx.update(|cx| {
            cx.global_mut::<ThemeState>().importing = false;
            match result {
                Ok(Some(bundle)) => change(bundle, None, cx),
                Ok(None) => cx.refresh_windows(),
                Err(error) => {
                    cx.global_mut::<ThemeState>().feedback =
                        Some((format!("Theme import failed. {error}"), true));
                    cx.refresh_windows();
                }
            }
        });
    })
    .detach();
}

fn export_theme(cx: &mut App) {
    let bundle = cx.global::<ThemeState>().active.clone();
    let filename = format!("{}.doolittle-theme.json", bundle.theme.id);
    let directory = UserDirs::new()
        .and_then(|home| home.document_dir().map(PathBuf::from))
        .or_else(|| std::env::current_dir().ok())
        .unwrap_or_default();
    let selected = cx.prompt_for_new_path(&directory, Some(&filename));
    let executor = cx.background_executor().clone();
    cx.spawn(async move |cx| {
        let result = match selected.await {
            Ok(Ok(Some(path))) => {
                executor
                    .spawn(async move {
                        let encoded = serde_json::to_vec_pretty(&bundle)?;
                        let mut file =
                            OpenOptions::new().create_new(true).write(true).open(path)?;
                        file.write_all(&encoded)?;
                        file.write_all(b"\n")?;
                        Ok(true)
                    })
                    .await
            }
            Ok(Ok(None)) => Ok(false),
            _ => Err(anyhow::anyhow!("The save dialog was unavailable.")),
        };
        let _ = cx.update(|cx| {
            let feedback = match result {
                Ok(true) => Some(("Theme exported.".into(), false)),
                Ok(false) => return,
                Err(_) => Some((
                    "Theme export failed. Choose a writable location and a new filename.".into(),
                    true,
                )),
            };
            cx.global_mut::<ThemeState>().feedback = feedback;
            cx.refresh_windows();
        });
    })
    .detach();
}
