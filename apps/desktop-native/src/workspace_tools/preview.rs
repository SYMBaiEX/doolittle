use gpui::{AnyElement, AppContext, Context, Entity, Subscription, Window, div, prelude::*, px};
use gpui_component::{
    Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
};
use url::Url;

use crate::{themes::Palette, workbench::Workbench};

#[cfg(target_os = "macos")]
mod macos;

#[derive(Default)]
pub(super) struct PreviewState {
    address: Option<Entity<InputState>>,
    _address_events: Option<Subscription>,
    status: Option<Status>,
    #[cfg(target_os = "macos")]
    page: Option<std::rc::Rc<macos::NativePreview>>,
    #[cfg(target_os = "macos")]
    generation: u64,
}

#[derive(Clone, Copy)]
enum Status {
    #[cfg(target_os = "macos")]
    Loading,
    #[cfg(target_os = "macos")]
    Ready,
    InvalidAddress,
    #[cfg(target_os = "macos")]
    Error(&'static str),
}

pub(super) fn activate(
    workbench: &mut Workbench,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let preview = &mut workbench.workspace_tools.preview;
    let address = preview.address.get_or_insert_with(|| {
        let input = cx.new(|cx| InputState::new(window, cx).placeholder("http://127.0.0.1:3000"));
        preview._address_events =
            Some(
                cx.subscribe_in(&input, window, |workbench, _, event, _, cx| {
                    if matches!(event, InputEvent::PressEnter { .. }) {
                        open(workbench, cx);
                    }
                }),
            );
        input
    });
    address.update(cx, |input, cx| input.focus(window, cx));
}

#[cfg(target_os = "macos")]
pub(super) fn sync_visibility(state: &PreviewState, visible: bool) {
    if !visible && let Some(page) = state.page.as_ref() {
        page.hide();
    }
}

fn entered_url(state: &mut PreviewState, cx: &gpui::App) -> Option<Url> {
    let url = state.address.as_ref().and_then(|address| {
        let address = address.read(cx).value();
        preview_url(address.trim())
    });
    if url.is_none() {
        state.status = Some(Status::InvalidAddress);
    } else if matches!(state.status, Some(Status::InvalidAddress)) {
        state.status = None;
    }
    url
}

fn open_external(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    if let Some(url) = entered_url(&mut workbench.workspace_tools.preview, cx) {
        cx.open_url(url.as_str());
    }
    cx.notify();
}

#[cfg(not(target_os = "macos"))]
fn open(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    open_external(workbench, cx);
}

#[cfg(target_os = "macos")]
fn open(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    let state = &mut workbench.workspace_tools.preview;
    let Some(url) = entered_url(state, cx) else {
        cx.notify();
        return;
    };
    let (sender, events) = async_channel::bounded(32);
    match macos::NativePreview::new(url, sender) {
        Ok(page) => {
            state.generation = state.generation.wrapping_add(1);
            let generation = state.generation;
            state.status = Some(Status::Loading);
            state.page = Some(page);
            cx.spawn(async move |this, cx| {
                while let Ok(status) = events.recv().await {
                    let keep_listening = this.update(cx, |this, cx| {
                        let preview = &mut this.workspace_tools.preview;
                        if preview.generation != generation || preview.page.is_none() {
                            return false;
                        }
                        preview.status = Some(status);
                        cx.notify();
                        true
                    });
                    if !keep_listening.unwrap_or(false) {
                        break;
                    }
                }
            })
            .detach();
        }
        Err(error) => state.status = Some(Status::Error(error)),
    }
    cx.notify();
}

pub(super) fn render(
    workbench: &Workbench,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let preview = &workbench.workspace_tools.preview;
    let page = page_surface(preview);
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .min_w_0()
        .overflow_hidden()
        .child(
            div()
                .flex_none()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(6.))
                .px(px(8.))
                .py(px(6.))
                .border_b_1()
                .border_color(colors.divider)
                .when_some(preview.address.as_ref(), |row, address| {
                    row.child(
                        div()
                            .flex_1()
                            .min_w(px(135.))
                            .child(Input::new(address).focus_bordered(false)),
                    )
                })
                .child(
                    Button::new("open-native-preview")
                        .small()
                        .outline()
                        .label(if cfg!(target_os = "macos") {
                            "Open preview"
                        } else {
                            "Open in browser"
                        })
                        .on_click(cx.listener(|this, _, _, cx| open(this, cx))),
                )
                .when(cfg!(target_os = "macos"), |row| {
                    row.child(
                        Button::new("open-preview-in-browser")
                            .small()
                            .ghost()
                            .label("Open in browser")
                            .on_click(cx.listener(|this, _, _, cx| open_external(this, cx))),
                    )
                })
                .children(page_controls(preview, cx)),
        )
        .when_some(preview.status, |body, status| {
            let (message, color) = match status {
                #[cfg(target_os = "macos")]
                Status::Ready => return body,
                #[cfg(target_os = "macos")]
                Status::Loading => ("Opening local preview…", colors.muted),
                Status::InvalidAddress => (
                    "Enter an HTTP or HTTPS loopback URL with a port.",
                    colors.danger,
                ),
                #[cfg(target_os = "macos")]
                Status::Error(message) => (message, colors.danger),
            };
            body.child(
                div()
                    .px(px(10.))
                    .py(px(7.))
                    .text_sm()
                    .text_color(color)
                    .child(message),
            )
        })
        .when(page.is_none() && preview.status.is_none(), |this| {
            this.child(
                div()
                    .flex()
                    .flex_1()
                    .min_h_0()
                    .items_center()
                    .justify_center()
                    .text_center()
                    .text_sm()
                    .text_color(colors.muted)
                    .px(px(16.))
                    .child("Start your dev server, then enter its local URL."),
            )
        })
        .children(page)
        .into_any_element()
}

#[cfg(target_os = "macos")]
fn page_controls(state: &PreviewState, cx: &mut Context<Workbench>) -> Vec<AnyElement> {
    if state.page.is_none() {
        return Vec::new();
    }
    vec![
        Button::new("reload-native-preview")
            .small()
            .ghost()
            .label("Reload")
            .on_click(cx.listener(|this, _, _, cx| {
                let preview = &mut this.workspace_tools.preview;
                if let Some(page) = preview.page.as_ref()
                    && page.reload()
                {
                    preview.status = Some(Status::Loading);
                    cx.notify();
                }
            }))
            .into_any_element(),
        Button::new("close-native-preview")
            .small()
            .ghost()
            .label("Close page")
            .on_click(cx.listener(|this, _, window, cx| {
                let preview = &mut this.workspace_tools.preview;
                preview.page = None;
                preview.status = None;
                activate(this, window, cx);
                cx.notify();
            }))
            .into_any_element(),
    ]
}

#[cfg(not(target_os = "macos"))]
fn page_controls(_state: &PreviewState, _cx: &mut Context<Workbench>) -> Vec<AnyElement> {
    Vec::new()
}

#[cfg(target_os = "macos")]
fn page_surface(state: &PreviewState) -> Option<AnyElement> {
    let page = state.page.as_ref()?.clone();
    Some(
        gpui::canvas(
            |_, _, _| (),
            move |bounds, _, window, cx| {
                use gpui_component::WindowExt;
                if window.has_active_dialog(cx) || window.has_active_sheet(cx) {
                    page.hide();
                } else {
                    page.place(window, bounds.intersect(&window.content_mask().bounds));
                }
            },
        )
        .flex_1()
        .min_h_0()
        .w_full()
        .into_any_element(),
    )
}

#[cfg(not(target_os = "macos"))]
fn page_surface(_state: &PreviewState) -> Option<AnyElement> {
    None
}

fn preview_url(address: &str) -> Option<Url> {
    if address.len() > 4096 || address.chars().any(char::is_control) || address.contains('\\') {
        return None;
    }
    let url = Url::parse(address).ok()?;
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

#[cfg(any(test, target_os = "macos"))]
fn permitted_navigation(origin: &Url, address: &str) -> bool {
    preview_url(address).is_some_and(|url| url.origin() == origin.origin())
}

#[cfg(any(test, target_os = "macos"))]
fn content_rules(origin: &Url) -> String {
    let escape = |value: &str| {
        let mut pattern = String::new();
        for character in value.chars() {
            if matches!(
                character,
                '.' | '[' | ']' | '+' | '?' | '^' | '$' | '(' | ')' | '\\'
            ) {
                pattern.push('\\');
            }
            pattern.push(character);
        }
        pattern
    };
    let base = origin.origin().ascii_serialization();
    let websocket = if origin.scheme() == "https" {
        "wss"
    } else {
        "ws"
    };
    let authority = base
        .split_once("://")
        .map(|(_, authority)| authority)
        .unwrap_or_default();
    let allow = [
        format!("^{}/", escape(&base)),
        format!("^{websocket}://{}/", escape(authority)),
        "^data:".to_owned(),
        "^blob:".to_owned(),
    ];
    let mut rules = vec![serde_json::json!({
        "trigger": {"url-filter": ".*"},
        "action": {"type": "block"}
    })];
    rules.extend(allow.into_iter().map(|filter| {
        serde_json::json!({
            "trigger": {"url-filter": filter, "url-filter-is-case-sensitive": true},
            "action": {"type": "ignore-previous-rules"}
        })
    }));
    serde_json::Value::from(rules).to_string()
}

#[cfg(test)]
mod tests {
    use super::{content_rules, permitted_navigation, preview_url};

    #[test]
    fn only_the_entered_loopback_origin_can_navigate() {
        let origin = preview_url("http://localhost:5173/src").unwrap();
        assert!(permitted_navigation(
            &origin,
            "http://localhost:5173/next?q=1"
        ));
        assert!(preview_url("https://[::1]:9443/").is_some());
        for address in [
            "http://localhost:5174/next",
            "http://127.0.0.1:5173/next",
            "https://localhost:5173/next",
            "http://user@localhost:5173/next",
            "http://localhost:5173\\@example.com/next",
            "http://localhost.example.com:5173/next",
            "file:///tmp/repo",
            "https://127.0.0.1.example.invalid:443/",
        ] {
            assert!(!permitted_navigation(&origin, address), "{address}");
        }
    }

    #[test]
    fn network_rules_allow_hmr_only_on_the_same_authority() {
        let origin = preview_url("https://[::1]:9443/a/?q=secret").unwrap();
        let rules: serde_json::Value = serde_json::from_str(&content_rules(&origin)).unwrap();
        assert_eq!(rules[0]["action"]["type"], "block");
        assert_eq!(rules[1]["trigger"]["url-filter"], r"^https://\[::1\]:9443/");
        assert_eq!(rules[2]["trigger"]["url-filter"], r"^wss://\[::1\]:9443/");
        assert!(!rules.to_string().contains("secret"));
    }
}
