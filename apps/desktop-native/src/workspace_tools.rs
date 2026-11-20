mod git;
mod preview;
mod terminal;

use gpui::{
    AnyElement, AppContext, Context, Pixels, SharedString, Subscription, Window, div, prelude::*,
    px,
};
use gpui_component::{
    Disableable, Selectable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
    resizable::{h_resizable, resizable_panel, v_resizable},
};
use serde_json::Value;

use crate::{themes::Palette, workbench::Workbench};

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
    maximized: bool,
    query: Option<gpui::Entity<InputState>>,
    query_events: Option<Subscription>,
    results: Option<String>,
    patch: Option<String>,
    git: git::GitState,
    preview: preview::PreviewState,
    pub terminal: terminal::TerminalState,
}

const CHANGES: &str = "/repo/changes";

impl Panel {
    fn title(self) -> &'static str {
        match self {
            Self::Search => "Search",
            Self::Git => "Git",
            Self::Terminal => "Terminal",
            Self::Preview => "Preview",
        }
    }
}

pub(crate) fn compact_ide(width: Pixels) -> bool {
    width < px(650.)
}

pub(crate) fn reveal_editor(workbench: &mut Workbench, window: &Window, cx: &gpui::App) {
    workbench.workspace_tools.maximized = false;
    if compact_ide(workbench.content_width(window, cx)) {
        workbench.explorer_open = false;
    }
}

pub(crate) fn toolbar(
    workbench: &Workbench,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> impl IntoElement {
    let active = workbench.workspace_tools.panel;
    div().flex().flex_wrap().gap(px(2.)).children(
        [
            ("Search", Panel::Search),
            ("Git", Panel::Git),
            ("Terminal", Panel::Terminal),
            ("Preview", Panel::Preview),
        ]
        .into_iter()
        .map(|(label, panel)| {
            let selected = active == Some(panel);
            Button::new(SharedString::from(format!("ide-tool-{label}")))
                .small()
                .ghost()
                .label(label)
                .selected(selected)
                .when(selected, |button| {
                    button.bg(colors.raised).text_color(colors.text)
                })
                .on_click(cx.listener(move |this, _, window, cx| {
                    select_tool(this, panel, window, cx);
                }))
        }),
    )
}

fn select_tool(
    this: &mut Workbench,
    panel: Panel,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let next = (this.workspace_tools.panel != Some(panel)).then_some(panel);
    this.workspace_tools.panel = next;
    this.workspace_tools.maximized = next == Some(Panel::Preview);
    if next.is_some() && compact_ide(this.content_width(window, cx)) {
        this.explorer_open = false;
    }
    #[cfg(target_os = "macos")]
    preview::sync_visibility(&this.workspace_tools.preview, next == Some(Panel::Preview));
    match next {
        Some(Panel::Search) => focus_search(this, window, cx),
        Some(Panel::Git) => git::open(this, window, cx),
        Some(Panel::Preview) => preview::activate(this, window, cx),
        Some(Panel::Terminal) => terminal::focus(this, window, cx),
        None => {}
    }
    cx.notify();
}

fn focus_search(this: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    if this.workspace_tools.query.is_none() {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("Search files for text"));
        this.workspace_tools.query_events =
            Some(
                cx.subscribe_in(&input, window, |this, _, event, _, cx| match event {
                    InputEvent::PressEnter { .. } => run_search(this, cx),
                    InputEvent::Change => cx.notify(),
                    _ => {}
                }),
            );
        this.workspace_tools.query = Some(input);
    }
    if let Some(input) = this.workspace_tools.query.as_ref() {
        input.update(cx, |input, cx| input.focus(window, cx));
    }
}

fn run_search(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let Some(input) = this.workspace_tools.query.as_ref() else {
        return;
    };
    let value = input.read(cx).value();
    let query = value.trim();
    if !this.ready() || query.is_empty() || query.len() > 1000 {
        return;
    }
    let route = query_route("/workspace/search", "query", query);
    if this.control_pending(&route) {
        return;
    }
    this.control_get(&route, cx);
    this.workspace_tools.results = Some(route);
    cx.notify();
}

fn dismiss_tool(this: &mut Workbench, cx: &mut Context<Workbench>) {
    this.workspace_tools.panel = None;
    this.workspace_tools.maximized = false;
    #[cfg(target_os = "macos")]
    preview::sync_visibility(&this.workspace_tools.preview, false);
    cx.notify();
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
            && !(compact_ide(workbench.content_width(window, cx))
                && workbench.explorer_open
                && workbench.ready())
            && !window.has_active_dialog(cx)
            && !window.has_active_sheet(cx);
        preview::sync_visibility(&workbench.workspace_tools.preview, preview_visible);
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (workbench, window, cx, workspace_visible);
}

pub(crate) fn layout(
    workbench: &Workbench,
    colors: Palette,
    editor: AnyElement,
    explorer: Option<AnyElement>,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let width = workbench.content_width(window, cx);
    if compact_ide(width)
        && let Some(explorer) = explorer
    {
        return explorer;
    }
    let editor_area = if let Some(panel) = workbench.workspace_tools.panel {
        let body = dock(workbench, panel, colors, window, cx);
        if workbench.workspace_tools.maximized {
            body
        } else {
            let height = (window.viewport_size().height - px(106.)).max(px(250.));
            let dock_size =
                (height * if panel == Panel::Terminal { 0.42 } else { 0.50 }).max(px(120.));
            v_resizable("ide-tool-split")
                .child(
                    resizable_panel()
                        .size(height - dock_size)
                        .size_range(px(116.)..Pixels::MAX)
                        .child(editor),
                )
                .child(
                    resizable_panel()
                        .size(dock_size)
                        .size_range(px(116.)..Pixels::MAX)
                        .child(body),
                )
                .into_any_element()
        }
    } else {
        editor
    };
    if let Some(explorer) = explorer {
        let min_explorer = px(152.);
        let max_explorer = (width * 0.46).clamp(px(224.), px(420.));
        let explorer_size = (width * 0.23).clamp(min_explorer, px(246.));
        h_resizable("ide-explorer-split")
            .child(
                resizable_panel()
                    .size(explorer_size)
                    .size_range(min_explorer..max_explorer)
                    .child(explorer),
            )
            .child(
                resizable_panel()
                    .size(width - explorer_size)
                    .size_range(px(288.)..Pixels::MAX)
                    .child(editor_area),
            )
            .into_any_element()
    } else {
        editor_area
    }
}

fn dock(
    workbench: &Workbench,
    panel: Panel,
    colors: Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let body = match panel {
        Panel::Search => search(workbench, colors, cx),
        Panel::Git => git::render(workbench, colors, window, cx),
        Panel::Terminal => terminal::render(workbench, colors, window, cx),
        Panel::Preview => preview::render(workbench, colors, cx),
    };
    let maximized = workbench.workspace_tools.maximized;
    div()
        .flex()
        .flex_col()
        .size_full()
        .min_w_0()
        .min_h_0()
        .overflow_hidden()
        .bg(colors.canvas)
        .child(
            div()
                .flex()
                .flex_none()
                .items_center()
                .gap(px(4.))
                .h(px(36.))
                .px(px(8.))
                .border_b_1()
                .border_color(colors.divider)
                .child(
                    div()
                        .flex_1()
                        .text_sm()
                        .font_weight(gpui::FontWeight::MEDIUM)
                        .child(panel.title()),
                )
                .child(
                    Button::new("ide-dock-size")
                        .small()
                        .ghost()
                        .label(if maximized {
                            "Split with editor"
                        } else {
                            "Expand"
                        })
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.workspace_tools.maximized = !this.workspace_tools.maximized;
                            cx.notify();
                        })),
                )
                .child(
                    Button::new("ide-dock-close")
                        .small()
                        .ghost()
                        .label("Hide panel")
                        .on_click(cx.listener(|this, _, _, cx| dismiss_tool(this, cx))),
                ),
        )
        .child(body)
        .into_any_element()
}

fn search(workbench: &Workbench, colors: Palette, cx: &mut Context<Workbench>) -> AnyElement {
    let route = workbench.workspace_tools.results.as_deref();
    let pending = route.is_some_and(|path| workbench.control_pending(path));
    let input_route = workbench.workspace_tools.query.as_ref().and_then(|input| {
        let value = input.read(cx).value();
        let query = value.trim();
        (!query.is_empty() && query.len() <= 1000)
            .then(|| query_route("/workspace/search", "query", query))
    });
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
                .px(px(8.))
                .py(px(6.))
                .border_b_1()
                .border_color(colors.divider)
                .when_some(workbench.workspace_tools.query.as_ref(), |row, input| {
                    row.child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(Input::new(input).focus_bordered(false)),
                    )
                })
                .child(
                    Button::new("workspace-search-action")
                        .small()
                        .outline()
                        .label("Search")
                        .loading(pending)
                        .disabled(
                            !workbench.ready()
                                || input_route
                                    .as_deref()
                                    .is_none_or(|path| workbench.control_pending(path)),
                        )
                        .on_click(cx.listener(|this, _, _, cx| run_search(this, cx))),
                ),
        )
        .child(
            div()
                .id("workspace-search-results")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(8.))
                .py(px(5.))
                .when(route.is_none(), |list| {
                    list.child(
                        div()
                            .px(px(5.))
                            .py(px(6.))
                            .text_sm()
                            .text_color(colors.muted)
                            .child(if workbench.ready() {
                                "Enter text to search this workspace."
                            } else {
                                "Start the workspace to search its files."
                            }),
                    )
                })
                .when_some(route, |list, route| {
                    let rows = (!pending && workbench.control_error(route).is_none())
                        .then(|| array(workbench, route, "results"))
                        .flatten();
                    list.child(
                        request_status(workbench, route, "No matching files", colors, rows)
                            .px(px(5.))
                            .py(px(3.)),
                    )
                    .children(rows.into_iter().flatten().filter_map(|result| {
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
                                    Button::new(SharedString::from(format!(
                                        "workspace-match-{path}"
                                    )))
                                    .small()
                                    .ghost()
                                    .label(path.clone())
                                    .tooltip(path.clone())
                                    .w_full()
                                    .justify_start()
                                    .disabled(workbench.workspace.loading_file.is_some())
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.open_file(path.clone(), false, window, cx)
                                    })),
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
                                                .pl(px(8.))
                                                .text_xs()
                                                .truncate()
                                                .text_color(colors.muted)
                                                .child(line.to_owned())
                                        }),
                                ),
                        )
                    }))
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
