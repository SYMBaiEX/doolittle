mod git;
mod preview;
mod terminal;

use gpui::{AnyElement, AppContext, Context, Window, div, prelude::*, px};
use gpui_component::{
    Disableable, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputState},
};
use serde_json::Value;

use crate::{
    themes::{Palette, Surface},
    workbench::Workbench,
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum Panel {
    Search,
    Git,
    Terminal,
    Preview,
}

#[derive(Default)]
pub(crate) struct WorkspaceTools {
    panel: Option<Panel>,
    query: Option<gpui::Entity<InputState>>,
    results: Option<String>,
    patch: Option<String>,
    git: git::GitState,
    preview: preview::PreviewState,
    pub terminal: terminal::TerminalState,
}

const CHANGES: &str = "/repo/changes";

pub(crate) fn toolbar(workbench: &Workbench, cx: &mut Context<Workbench>) -> impl IntoElement {
    let active = workbench.workspace_tools.panel;
    div().flex().gap(px(2.)).children(
        [
            ("Search", Panel::Search),
            ("Git", Panel::Git),
            ("Terminal", Panel::Terminal),
            ("Preview", Panel::Preview),
        ]
        .into_iter()
        .map(|(label, panel)| {
            Button::new(label)
                .small()
                .ghost()
                .label(label)
                .selected(active == Some(panel))
                .on_click(cx.listener(move |this, _, window, cx| {
                    this.workspace_tools.panel = (active != Some(panel)).then_some(panel);
                    #[cfg(target_os = "macos")]
                    preview::sync_visibility(
                        &this.workspace_tools.preview,
                        this.workspace_tools.panel == Some(Panel::Preview),
                    );
                    match this.workspace_tools.panel {
                        Some(Panel::Search) => {
                            let input = this.workspace_tools.query.get_or_insert_with(|| {
                                cx.new(|cx| {
                                    InputState::new(window, cx).placeholder("Search workspace text")
                                })
                            });
                            input.update(cx, |input, cx| input.focus(window, cx));
                        }
                        Some(Panel::Git) => git::open(this, window, cx),
                        Some(Panel::Preview) => preview::activate(this, window, cx),
                        _ => {}
                    }
                    cx.notify();
                }))
        }),
    )
}

pub(crate) fn sync_native_preview(
    workbench: &Workbench,
    window: &mut Window,
    cx: &mut Context<Workbench>,
    workspace_visible: bool,
) {
    #[cfg(target_os = "macos")]
    {
        use gpui_component::WindowExt;
        let preview_visible = workspace_visible
            && workbench.workspace_tools.panel == Some(Panel::Preview)
            && !window.has_active_dialog(cx)
            && !window.has_active_sheet(cx);
        preview::sync_visibility(&workbench.workspace_tools.preview, preview_visible);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (workbench, window, cx, workspace_visible);
}

pub(crate) fn render(
    workbench: &Workbench,
    colors: Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Option<AnyElement> {
    let panel = workbench.workspace_tools.panel?;
    let body = match panel {
        Panel::Search => search(workbench, colors, cx),
        Panel::Git => git::render(workbench, colors, window, cx),
        Panel::Terminal => terminal::render(workbench, colors, window, cx),
        Panel::Preview => preview::render(workbench, colors, cx),
    };
    let height = window.viewport_size().height;
    let preferred_height = if cfg!(target_os = "macos") && panel == Panel::Preview {
        height * 0.61
    } else {
        px(240.).min(height * 0.46)
    };
    Some(
        colors
            .surface(div(), Surface::Panel)
            .flex()
            .flex_col()
            .min_h_0()
            .h(preferred_height)
            .border_t_1()
            .border_color(colors.divider)
            .child(body)
            .into_any_element(),
    )
}

fn search(workbench: &Workbench, colors: Palette, cx: &mut Context<Workbench>) -> AnyElement {
    let route = workbench.workspace_tools.results.as_deref();
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            div()
                .flex()
                .gap(px(6.))
                .items_center()
                .p(px(6.))
                .when_some(workbench.workspace_tools.query.as_ref(), |row, input| {
                    row.child(
                        div()
                            .flex_1()
                            .child(Input::new(input).focus_bordered(false)),
                    )
                })
                .child(
                    Button::new("workspace-search-action")
                        .small()
                        .outline()
                        .label("Search")
                        .disabled(
                            !workbench.ready()
                                || route.is_some_and(|path| workbench.control_pending(path)),
                        )
                        .on_click(cx.listener(|this, _, _, cx| {
                            let Some(input) = this.workspace_tools.query.as_ref() else {
                                return;
                            };
                            let query = input.read(cx).value();
                            let query = query.trim();
                            if query.is_empty() || query.len() > 1000 {
                                return;
                            }
                            let route = query_route("/workspace/search", "query", query);
                            this.control_get(&route, cx);
                            this.workspace_tools.results = Some(route);
                            cx.notify();
                        })),
                ),
        )
        .child(
            div()
                .id("workspace-search-results")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(9.))
                .when_some(route, |list, route| {
                    let rows = array(workbench, route, "results");
                    list.child(request_status(workbench, route, "No matches", colors, rows))
                        .children(rows.into_iter().flatten().enumerate().filter_map(
                            |(index, result)| {
                                let path = result.get("path")?.as_str()?.to_owned();
                                Some(
                                    div()
                                        .flex()
                                        .flex_col()
                                        .gap(px(2.))
                                        .border_b_1()
                                        .border_color(colors.divider)
                                        .py(px(5.))
                                        .child(
                                            Button::new(("workspace-match", index))
                                                .small()
                                                .ghost()
                                                .label(path.clone())
                                                .justify_start()
                                                .on_click(cx.listener(
                                                    move |this, _, window, cx| {
                                                        this.open_file(
                                                            path.clone(),
                                                            false,
                                                            window,
                                                            cx,
                                                        )
                                                    },
                                                )),
                                        )
                                        .children(
                                            result
                                                .get("matches")
                                                .and_then(Value::as_array)
                                                .into_iter()
                                                .flatten()
                                                .filter_map(Value::as_str)
                                                .take(6)
                                                .map(|line| {
                                                    div()
                                                        .text_xs()
                                                        .truncate()
                                                        .text_color(colors.muted)
                                                        .child(line.to_owned())
                                                }),
                                        ),
                                )
                            },
                        ))
                }),
        )
        .into_any_element()
}

fn array<'a>(workbench: &'a Workbench, route: &str, field: &str) -> Option<&'a Vec<Value>> {
    workbench.control_value(route)?.get(field)?.as_array()
}

fn request_status(
    workbench: &Workbench,
    route: &str,
    empty: &str,
    colors: Palette,
    rows: Option<&Vec<Value>>,
) -> gpui::Div {
    if let Some(error) = workbench.control_error(route) {
        div()
            .text_sm()
            .text_color(colors.danger)
            .child(error.to_owned())
    } else if workbench.control_pending(route) {
        div().text_sm().text_color(colors.muted).child("Loading…")
    } else if rows.is_some_and(Vec::is_empty) {
        div()
            .text_sm()
            .text_color(colors.muted)
            .child(empty.to_owned())
    } else {
        div()
    }
}

fn query_route(path: &str, name: &str, value: &str) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair(name, value)
        .finish();
    format!("{path}?{query}")
}
