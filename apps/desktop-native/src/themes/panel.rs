use std::{fs::OpenOptions, io::Write, path::PathBuf};

use directories::UserDirs;
use gpui::{
    AnyElement, App, Div, FontWeight, Hsla, IntoElement, ParentElement, PathPromptOptions, Styled,
    div, prelude::*, px,
};
use gpui_component::{Disableable, Icon, IconName, Selectable, Sizable, button::Button};

use super::{BUILTINS, Palette, Surface, ThemeFileTransfer, ThemeState, change, schema};
use schema::{Appearance, Density, Manifest};

pub fn appearance_panel(cx: &App) -> AnyElement {
    let state = cx.global::<ThemeState>();
    let colors = Palette::current(cx);
    let appearance = state.active.appearance;
    let density = state.active.density;
    let dark = gpui_component::Theme::global(cx).is_dark();

    let transfer = state.file_transfer;
    let busy = transfer.is_some();
    let modes = div().flex().flex_wrap().gap_1().children(
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
                busy,
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
    let densities = div().flex().flex_wrap().gap_1().children(
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
                busy,
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

    // Exact equality keeps imported themes distinct even when they use a built-in ID.
    let imported = !BUILTINS.contains(&state.active.theme);
    let mut layouts = div().flex().flex_wrap().gap_2();
    let mut presets = div().flex().flex_wrap().gap_2();
    for (index, theme) in BUILTINS.iter().enumerate() {
        let selected = theme == &state.active.theme;
        let preview = Palette::from_manifest(theme, dark, density, colors.comic_font);
        let choice = if is_desktop_theme(theme) {
            layout_choice(
                ("desktop-theme", index),
                theme,
                preview,
                selected,
                busy,
                colors,
            )
        } else {
            palette_choice(
                ("palette-theme", index),
                theme,
                preview,
                selected,
                busy,
                colors,
            )
        }
        .on_click(move |_, window, cx| {
            let mut bundle = cx.global::<ThemeState>().active.clone();
            if bundle.theme != BUILTINS[index] {
                bundle.theme = BUILTINS[index].clone();
                change(bundle, Some(window), cx);
            }
        });
        if is_desktop_theme(theme) {
            layouts = layouts.child(choice);
        } else {
            presets = presets.child(choice);
        }
    }
    if imported {
        let preview = Palette::from_manifest(&state.active.theme, dark, density, colors.comic_font);
        layouts = layouts.child(layout_choice(
            ("imported-theme", 0),
            &state.active.theme,
            preview,
            true,
            busy,
            colors,
        ));
    }

    div()
        .flex()
        .flex_col()
        .min_w_0()
        .child(
            section(colors)
                .items_start()
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .w_full()
                        .items_center()
                        .justify_between()
                        .gap_2()
                        .child(section_title("Appearance", colors))
                        .child(
                            div()
                                .flex()
                                .flex_wrap()
                                .gap_1()
                                .child(
                                    Button::new("appearance-import")
                                        .small()
                                        .outline()
                                        .label("Import theme")
                                        .disabled(busy)
                                        .on_click(|_, _, cx| import_theme(cx)),
                                )
                                .child(
                                    Button::new("appearance-export")
                                        .small()
                                        .outline()
                                        .label("Export current theme")
                                        .disabled(busy)
                                        .on_click(|_, _, cx| export_theme(cx)),
                                ),
                        ),
                )
                .child(
                    div()
                        .text_size(colors.metadata_size())
                        .text_color(colors.muted)
                        .child(state.active.theme.description.clone()),
                )
                .when_some(transfer, |node, transfer| {
                    node.child(div().text_color(colors.muted).child(match transfer {
                        ThemeFileTransfer::Import => "Opening theme…",
                        ThemeFileTransfer::Export => "Saving theme…",
                    }))
                })
                .when_some(state.feedback.clone(), |node, (message, failed)| {
                    node.child(
                        div()
                            .text_color(if failed {
                                colors.danger
                            } else {
                                colors.positive
                            })
                            .child(message),
                    )
                }),
        )
        .child(
            section(colors)
                .child(field("Color mode", modes, colors))
                .child(field("Interface density", densities, colors)),
        )
        .child(
            section(colors)
                .child(section_title("Desktop themes", colors))
                .child(layouts),
        )
        .child(
            section(colors)
                .child(section_title("Color palettes", colors))
                .child(presets),
        )
        .into_any_element()
}

fn is_desktop_theme(theme: &Manifest) -> bool {
    matches!(
        theme.id.as_str(),
        "companion" | "canvas" | "anime-atelier" | "golden-gate-glass"
    )
}

fn section(colors: Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .gap(colors.row_space())
        .px(colors.page_space())
        .py(px(14.))
        .border_b_1()
        .border_color(colors.divider)
}

fn section_title(label: &'static str, colors: Palette) -> Div {
    div()
        .font_weight(FontWeight::SEMIBOLD)
        .text_size(colors.control_size())
        .child(label)
}

fn check_mark(colors: Palette) -> Icon {
    Icon::new(IconName::Check).small().text_color(colors.muted)
}

fn option(
    id: (&'static str, &'static str),
    label: &'static str,
    selected: bool,
    disabled: bool,
    colors: Palette,
) -> Button {
    let button = Button::new(gpui::SharedString::from(format!("{}-{}", id.0, id.1)))
        .small()
        .outline()
        .min_h(colors.control_height())
        .label(label)
        .selected(selected)
        .disabled(disabled);
    if selected {
        button.tooltip(format!("{label} (Selected)"))
    } else {
        button
    }
}

fn field(label: &'static str, contents: Div, colors: Palette) -> Div {
    div()
        .flex()
        .flex_wrap()
        .items_center()
        .justify_between()
        .gap(colors.row_space())
        .child(section_title(label, colors))
        .child(contents)
}

fn layout_choice(
    id: (&'static str, usize),
    theme: &Manifest,
    preview: Palette,
    selected: bool,
    disabled: bool,
    colors: Palette,
) -> Button {
    Button::new(id)
        .outline()
        .selected(selected)
        .disabled(disabled)
        .tooltip(theme_tooltip(theme, selected))
        .flex_1()
        .min_w(px(160.))
        .max_w(px(300.))
        .h(px(111.))
        .px(px(8.))
        .child(
            div()
                .flex()
                .flex_col()
                .w_full()
                .min_w_0()
                .gap_2()
                .child(preview_tile(preview))
                .child(
                    div()
                        .flex()
                        .min_w_0()
                        .items_center()
                        .justify_between()
                        .gap_1()
                        .child(
                            div()
                                .min_w_0()
                                .truncate()
                                .text_size(px(15.))
                                .font_family(preview.display_family())
                                .font_weight(FontWeight::SEMIBOLD)
                                .child(theme.name.clone()),
                        )
                        .when(selected, |node| node.child(check_mark(colors))),
                ),
        )
}

fn palette_choice(
    id: (&'static str, usize),
    theme: &Manifest,
    preview: Palette,
    selected: bool,
    disabled: bool,
    colors: Palette,
) -> Button {
    Button::new(id)
        .small()
        .outline()
        .selected(selected)
        .disabled(disabled)
        .tooltip(theme_tooltip(theme, selected))
        .child(
            div()
                .flex()
                .items_center()
                .gap_2()
                .child(div().size(px(9.)).rounded_full().bg(preview.accent))
                .child(theme.name.clone())
                .when(selected, |node| node.child(check_mark(colors))),
        )
}

fn theme_tooltip(theme: &Manifest, selected: bool) -> String {
    if selected {
        format!("{} (Selected)", theme.name)
    } else {
        theme.name.clone()
    }
}

fn preview_tile(preview: Palette) -> Div {
    let sample_line = |width| {
        div()
            .w(px(width))
            .h(px(3.))
            .rounded_full()
            .bg(Hsla::from(preview.text).opacity(0.62))
    };
    div()
        .relative()
        .w_full()
        .min_w_0()
        .h(px(68.))
        .overflow_hidden()
        .rounded(px(4.))
        .border_1()
        .border_color(preview.divider)
        .child(preview.canvas_backdrop())
        .child(
            div()
                .absolute()
                .inset_0()
                .flex()
                .flex_col()
                .child(
                    preview.surface(
                        div()
                            .h(px(13.))
                            .flex()
                            .items_center()
                            .px(px(4.))
                            .child(sample_line(23.)),
                        Surface::Header,
                    ),
                )
                .child(
                    div()
                        .flex()
                        .flex_1()
                        .min_w_0()
                        .when(!preview.compact_navigation(), |node| {
                            node.child(
                                preview.surface(
                                    div()
                                        .w(px(25.))
                                        .h_full()
                                        .border_r_1()
                                        .border_color(preview.divider),
                                    Surface::Navigation,
                                ),
                            )
                        })
                        .child(
                            preview.surface(
                                div()
                                    .flex()
                                    .flex_1()
                                    .min_w_0()
                                    .flex_col()
                                    .justify_between()
                                    .p(px(5.))
                                    .child(
                                        div()
                                            .flex()
                                            .flex_col()
                                            .gap_1()
                                            .child(sample_line(32.))
                                            .child(sample_line(21.)),
                                    )
                                    .child(
                                        preview.surface(
                                            div()
                                                .flex()
                                                .items_center()
                                                .justify_between()
                                                .px(px(4.))
                                                .h(px(12.))
                                                .child(sample_line(16.))
                                                .child(
                                                    div()
                                                        .size(px(6.))
                                                        .rounded_full()
                                                        .bg(preview.accent),
                                                ),
                                            Surface::Composer,
                                        ),
                                    ),
                                Surface::Panel,
                            ),
                        ),
                ),
        )
}

fn start_file_transfer(cx: &mut App, transfer: ThemeFileTransfer) -> bool {
    let state = cx.global_mut::<ThemeState>();
    if state.file_transfer.is_some() {
        return false;
    }
    state.file_transfer = Some(transfer);
    state.feedback = None;
    cx.refresh_windows();
    true
}

fn import_theme(cx: &mut App) {
    if !start_file_transfer(cx, ThemeFileTransfer::Import) {
        return;
    }
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
            cx.global_mut::<ThemeState>().file_transfer = None;
            match result {
                Ok(Some(bundle)) => {
                    let name = bundle.theme.name.clone();
                    change(bundle, None, cx);
                    let state = cx.global_mut::<ThemeState>();
                    if state.feedback.is_none() {
                        state.feedback = Some((format!("Applied {name}."), false));
                    }
                    cx.refresh_windows();
                }
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
    if !start_file_transfer(cx, ThemeFileTransfer::Export) {
        return;
    }
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
                Ok(false) => None,
                Err(_) => Some((
                    "Theme export failed. Choose a writable location and a new filename.".into(),
                    true,
                )),
            };
            let state = cx.global_mut::<ThemeState>();
            state.file_transfer = None;
            state.feedback = feedback;
            cx.refresh_windows();
        });
    })
    .detach();
}
