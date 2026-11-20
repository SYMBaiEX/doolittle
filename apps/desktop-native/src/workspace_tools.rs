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
    Changes,
    Terminal,
    Preview,
}

#[derive(Default)]
pub(crate) struct WorkspaceTools {
    panel: Option<Panel>,
    query: Option<gpui::Entity<InputState>>,
    results: Option<String>,
    patch: Option<String>,
    preview: Option<gpui::Entity<InputState>>,
    preview_error: Option<&'static str>,
    pub terminal: terminal::TerminalState,
}

const CHANGES: &str = "/repo/changes";

pub(crate) fn toolbar(workbench: &Workbench, cx: &mut Context<Workbench>) -> impl IntoElement {
    let active = workbench.workspace_tools.panel;
    div().flex().gap(px(2.)).children(
        [
            ("Search", Panel::Search),
            ("Changes", Panel::Changes),
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
                    match this.workspace_tools.panel {
                        Some(Panel::Search) => {
                            let input = this.workspace_tools.query.get_or_insert_with(|| {
                                cx.new(|cx| {
                                    InputState::new(window, cx).placeholder("Search workspace text")
                                })
                            });
                            input.update(cx, |input, cx| input.focus(window, cx));
                        }
                        Some(Panel::Changes) => this.control_get(CHANGES, cx),
                        Some(Panel::Preview) => {
                            let input = this.workspace_tools.preview.get_or_insert_with(|| {
                                cx.new(|cx| {
                                    InputState::new(window, cx).placeholder("http://127.0.0.1:3000")
                                })
                            });
                            input.update(cx, |input, cx| input.focus(window, cx));
                        }
                        _ => {}
                    }
                    cx.notify();
                }))
        }),
    )
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
        Panel::Changes => changes(workbench, colors, cx),
        Panel::Terminal => terminal::render(workbench, colors, window, cx),
        Panel::Preview => preview(workbench, colors, cx),
    };
    Some(
        colors
            .surface(div(), Surface::Panel)
            .flex()
            .flex_col()
            .min_h_0()
            .h(px(240.))
            .max_h(window.viewport_size().height * 0.46)
            .border_t_1()
            .border_color(colors.divider)
            .child(body)
            .into_any_element(),
    )
}

fn preview(workbench: &Workbench, colors: Palette, cx: &mut Context<Workbench>) -> AnyElement {
    div()
        .flex()
        .flex_col()
        .gap(px(7.))
        .p(px(10.))
        .child("Open a local development server")
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.))
                .when_some(workbench.workspace_tools.preview.as_ref(), |row, input| {
                    row.child(
                        div()
                            .flex_1()
                            .child(Input::new(input).focus_bordered(false)),
                    )
                })
                .child(
                    Button::new("open-local-preview")
                        .small()
                        .outline()
                        .label("Open in browser")
                        .on_click(cx.listener(|this, _, _, cx| {
                            let Some(input) = this.workspace_tools.preview.as_ref() else {
                                return;
                            };
                            let address = input.read(cx).value();
                            if let Some(url) = preview_url(address.trim()) {
                                this.workspace_tools.preview_error = None;
                                cx.open_url(url.as_str());
                            } else {
                                this.workspace_tools.preview_error =
                                    Some("Enter an HTTP or HTTPS loopback URL with a port.");
                            }
                            cx.notify();
                        })),
                ),
        )
        .when_some(workbench.workspace_tools.preview_error, |pane, error| {
            pane.child(div().text_sm().text_color(colors.danger).child(error))
        })
        .into_any_element()
}

fn preview_url(address: &str) -> Option<url::Url> {
    if address.len() > 4096 || address.chars().any(char::is_control) {
        return None;
    }
    let url = url::Url::parse(address).ok()?;
    let loopback = match url.host()? {
        url::Host::Ipv4(ip) => ip.is_loopback(),
        url::Host::Ipv6(ip) => ip.is_loopback(),
        url::Host::Domain(name) => name == "localhost",
    };
    (loopback
        && matches!(url.scheme(), "http" | "https")
        && url.port().is_some_and(|port| port != 0)
        && url.username().is_empty()
        && url.password().is_none())
    .then_some(url)
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

fn changes(workbench: &Workbench, colors: Palette, cx: &mut Context<Workbench>) -> AnyElement {
    if let Some(route) = workbench.workspace_tools.patch.as_deref() {
        let patch = workbench
            .control_value(route)
            .and_then(|result| result.pointer("/patch/patch"))
            .and_then(Value::as_str);
        return div()
            .flex()
            .flex_col()
            .flex_1()
            .min_h_0()
            .child(
                Button::new("repo-changes-back")
                    .small()
                    .ghost()
                    .label("Back to changes")
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.workspace_tools.patch = None;
                        cx.notify();
                    })),
            )
            .child(
                div()
                    .id("repo-patch-output")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .p(px(8.))
                    .font_family("Menlo")
                    .child(request_status(workbench, route, "", colors, None))
                    .children(
                        patch
                            .into_iter()
                            .flat_map(str::lines)
                            .take(1500)
                            .map(|line| {
                                div()
                                    .text_xs()
                                    .text_color(if line.starts_with('+') {
                                        colors.positive
                                    } else if line.starts_with('-') {
                                        colors.danger
                                    } else {
                                        colors.text
                                    })
                                    .child(line.to_owned())
                            }),
                    ),
            )
            .into_any_element();
    }
    let rows = array(workbench, CHANGES, "changes");
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            Button::new("reload-repository")
                .small()
                .ghost()
                .label("Refresh changes")
                .on_click(cx.listener(|this, _, _, cx| this.control_get(CHANGES, cx))),
        )
        .child(
            div()
                .id("repo-files")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .px(px(8.))
                .child(request_status(
                    workbench,
                    CHANGES,
                    "No changed files",
                    colors,
                    rows,
                ))
                .children(
                    rows.into_iter()
                        .flatten()
                        .enumerate()
                        .filter_map(|(index, change)| {
                            let path = change.get("path")?.as_str()?.to_owned();
                            let staged = change.get("staged") == Some(&Value::Bool(true))
                                && change.get("unstaged") != Some(&Value::Bool(true));
                            Some(
                                Button::new(("changed-file", index))
                                    .small()
                                    .ghost()
                                    .label(path.clone())
                                    .justify_start()
                                    .w_full()
                                    .on_click(cx.listener(move |this, _, _, cx| {
                                        let mut route = query_route("/repo/patch", "path", &path);
                                        if staged {
                                            route.push_str("&staged=true");
                                        }
                                        this.control_get(&route, cx);
                                        this.workspace_tools.patch = Some(route);
                                        cx.notify();
                                    })),
                            )
                        }),
                ),
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

#[cfg(test)]
mod tests {
    use super::preview_url;

    #[test]
    fn preview_accepts_only_port_scoped_loopback_web_urls() {
        assert!(preview_url("http://localhost:5173/src").is_some());
        assert!(preview_url("https://[::1]:9443/").is_some());
        assert!(preview_url("file:///tmp/repo").is_none());
        assert!(preview_url("https://127.0.0.1.example.invalid:443/").is_none());
        assert!(preview_url("http://admin@127.0.0.1:8000/").is_none());
    }
}
