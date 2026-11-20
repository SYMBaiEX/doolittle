mod activity;
mod agents;
mod automation;
mod home;
mod inbox;
mod media;
mod review;
mod work;

use std::collections::HashMap;

use doolittle_runtime::ControlMethod;
use gpui::{
    AnyElement, App, AppContext as _, Context, Div, Entity, FontWeight, Subscription, Window, div,
    prelude::*, px,
};
use gpui_component::{
    Disableable as _, Selectable as _, Sizable as _,
    button::{Button, ButtonVariants as _},
    input::{Input, InputEvent, InputState},
};
use serde_json::Value;

use crate::{ui::Palette, workbench::Workbench};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OpsPage {
    Home,
    Activity,
    Insights,
    Media,
    Work,
    Review,
    Automations,
    Agents,
    Inbox,
}

impl OpsPage {
    pub(crate) const fn label(self) -> &'static str {
        match self {
            Self::Home => "Overview",
            Self::Activity => "Activity",
            Self::Insights => "Insights",
            Self::Media => "Assets",
            Self::Work => "Work",
            Self::Review => "Review",
            Self::Automations => "Automations",
            Self::Agents => "Agents",
            Self::Inbox => "Inbox",
        }
    }
}

#[derive(Default)]
pub(crate) struct OperationsState {
    inputs: HashMap<&'static str, Entity<InputState>>,
    search_keys: HashMap<&'static str, Subscription>,
    activity: activity::ActivityState,
    agents: agents::AgentsState,
    automation: automation::AutomationState,
    inbox: inbox::InboxState,
    media: media::MediaState,
    review: review::ReviewState,
    work: work::WorkState,
    confirming: bool,
}

impl OperationsState {
    fn search(
        &mut self,
        name: &'static str,
        placeholder: &'static str,
        apply: fn(&mut Workbench, &mut Context<Workbench>),
        window: &mut Window,
        cx: &mut Context<Workbench>,
    ) -> Entity<InputState> {
        let input = self.input(name, placeholder, false, window, cx);
        self.search_keys.entry(name).or_insert_with(|| {
            cx.subscribe_in(&input, window, move |workbench, _, event, _, cx| {
                if matches!(event, InputEvent::PressEnter { .. }) {
                    apply(workbench, cx);
                }
            })
        });
        input
    }

    fn input(
        &mut self,
        name: &'static str,
        placeholder: &'static str,
        multiline: bool,
        window: &mut Window,
        cx: &mut Context<Workbench>,
    ) -> Entity<InputState> {
        self.inputs
            .entry(name)
            .or_insert_with(|| {
                cx.new(|cx| {
                    let state = InputState::new(window, cx).placeholder(placeholder);
                    if multiline {
                        state.auto_grow(2, 5)
                    } else {
                        state
                    }
                })
            })
            .clone()
    }

    fn value(&self, name: &'static str, cx: &App) -> String {
        self.inputs
            .get(name)
            .map(|state| state.read(cx).value().trim().to_owned())
            .unwrap_or_default()
    }

    fn query(&self, name: &'static str, cx: &App) -> String {
        self.value(name, cx)
            .chars()
            .filter(|ch| !ch.is_control())
            .take(128)
            .collect()
    }

    fn set_value(
        &self,
        name: &'static str,
        value: impl Into<gpui::SharedString>,
        window: &mut Window,
        cx: &mut Context<Workbench>,
    ) {
        if let Some(entity) = self.inputs.get(name) {
            entity.update(cx, |state, cx| state.set_value(value, window, cx));
        }
    }
}

pub(crate) fn render(
    page: OpsPage,
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let ready = this.ready();
    let body = if ready {
        match page {
            OpsPage::Home => home::render(this, colors, window, cx),
            OpsPage::Activity => activity::render(this, colors, window, cx),
            OpsPage::Insights => home::insights(this, colors, window, cx),
            OpsPage::Media => media::render(this, colors, window, cx),
            OpsPage::Work => work::render(this, colors, window, cx),
            OpsPage::Review => work::review(this, colors, window, cx),
            OpsPage::Automations => automation::render(this, colors, window, cx),
            OpsPage::Agents => work::agents(this, colors, window, cx),
            OpsPage::Inbox => inbox::render(this, colors, window, cx),
        }
    } else {
        unavailable(this, colors, cx).into_any_element()
    };
    div()
        .id(gpui::SharedString::from(format!(
            "operations-page-{}",
            page.label()
        )))
        .flex()
        .flex_col()
        .size_full()
        .min_w_0()
        .min_h_0()
        .child(
            div()
                .flex()
                .items_start()
                .justify_between()
                .gap(px(12.))
                .py(px(12.))
                .px(px(18.))
                .border_b_1()
                .border_color(colors.divider)
                .child(heading(page.label()).text_size(px(18.)))
                .when(ready, |header| {
                    header.child(
                        Button::new("ops-refresh")
                            .small()
                            .ghost()
                            .label("Refresh")
                            .on_click(cx.listener(move |this, _, _, cx| refresh(page, this, cx))),
                    )
                }),
        )
        .child(body)
        .into_any_element()
}

fn unavailable(this: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let missing_workspace = this.needs_workspace();
    let (title, detail) = if missing_workspace {
        (
            "Open a workspace",
            "Choose a folder to see its activity and controls.",
        )
    } else if this.connecting {
        (
            "Starting ElizaOS",
            "Workspace controls will be available when the runtime is ready.",
        )
    } else {
        (
            "ElizaOS is offline",
            "Start the workspace runtime to use this page.",
        )
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .justify_center()
        .items_center()
        .px(px(18.))
        .child(
            div()
                .flex()
                .flex_col()
                .items_start()
                .gap(px(8.))
                .max_w(px(420.))
                .child(heading(title))
                .child(muted(colors, detail))
                .when_some(this.error.as_ref(), |state, message| {
                    state.child(error(colors, message.clone()))
                })
                .when(!this.connecting, |state| {
                    state.child(
                        button("ops-start")
                            .small()
                            .primary()
                            .label(if missing_workspace {
                                "Open folder…"
                            } else {
                                "Start ElizaOS"
                            })
                            .on_click(cx.listener(move |this, _, window, cx| {
                                if missing_workspace {
                                    this.choose_workspace(window, cx);
                                } else {
                                    this.connect(window, cx);
                                }
                            })),
                    )
                }),
        )
}

pub(crate) fn refresh(page: OpsPage, this: &mut Workbench, cx: &mut Context<Workbench>) {
    let routes: &[&str] = match page {
        OpsPage::Home => {
            this.refresh_sessions(cx);
            home::HOME_ROUTES
        }
        OpsPage::Activity => return activity::refresh(this, cx),
        OpsPage::Insights => home::INSIGHTS_ROUTES,
        OpsPage::Media => return media::refresh(this, cx),
        OpsPage::Work => return work::refresh(this, cx),
        OpsPage::Review => return work::refresh_review(this, cx),
        OpsPage::Automations => &[automation::JOBS, automation::RUNS],
        OpsPage::Agents => &[work::IDENTITY, agents::BOTS, work::WORKERS],
        OpsPage::Inbox => return inbox::refresh(this, cx),
    };
    for &path in routes {
        this.control_get(path, cx);
    }
}

fn scroll(id: &'static str) -> gpui::Stateful<Div> {
    div()
        .id(id)
        .flex_1()
        .min_h_0()
        .min_w_0()
        .overflow_y_scroll()
}

fn panel(colors: &Palette, title: &'static str) -> Div {
    div().min_w_0().child(
        div()
            .px(px(18.))
            .pt(px(12.))
            .pb(px(7.))
            .border_b_1()
            .border_color(colors.divider)
            .font_weight(FontWeight::SEMIBOLD)
            .text_size(px(13.))
            .child(title),
    )
}

fn row(colors: &Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .min_w_0()
        .gap(px(6.))
        .px(px(18.))
        .py(px(10.))
        .border_b_1()
        .border_color(colors.divider)
}

fn heading(title: impl Into<gpui::SharedString>) -> Div {
    div()
        .min_w_0()
        .text_size(px(14.))
        .font_weight(FontWeight::SEMIBOLD)
        .child(title.into())
}

fn muted(colors: &Palette, text: impl Into<gpui::SharedString>) -> Div {
    div()
        .text_color(colors.muted)
        .text_size(px(12.))
        .child(text.into())
}

fn empty(colors: &Palette, text: impl Into<gpui::SharedString>) -> Div {
    muted(colors, text).px(px(18.)).py(px(18.))
}

fn error(colors: &Palette, text: impl Into<gpui::SharedString>) -> Div {
    div()
        .text_size(px(12.))
        .text_color(colors.danger)
        .child(text.into())
}

fn status(colors: &Palette, value: &str) -> Div {
    let ink = match value {
        "complete" | "completed" | "active" | "approved" | "sent" | "success" | "online"
        | "ready" => colors.positive,
        "error" | "failed" | "denied" | "rejected" | "blocked" => colors.danger,
        _ => colors.muted,
    };
    div()
        .flex_none()
        .rounded(px(4.))
        .px(px(7.))
        .py(px(2.))
        .border_1()
        .border_color(colors.divider)
        .text_color(ink)
        .text_size(px(11.))
        .child(value.replace(['-', '_'], " "))
}

fn group() -> Div {
    div()
        .flex()
        .flex_wrap()
        .items_center()
        .min_w_0()
        .gap(px(6.))
}

fn button(id: impl Into<gpui::SharedString>) -> Button {
    Button::new(id.into())
}

fn tab(id: (&str, &str), label: &'static str, selected: bool) -> Button {
    let control = button(format!("{}-{}", id.0, id.1)).small().label(label);
    if selected {
        control.outline().selected(true)
    } else {
        control.ghost()
    }
}

fn search_field(state: &Entity<InputState>) -> Div {
    div()
        .min_w(px(170.))
        .flex_1()
        .child(Input::new(state).focus_bordered(false).w_full())
}

fn field(state: &Entity<InputState>, label: &'static str, colors: &Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(4.))
        .min_w_0()
        .child(muted(colors, label))
        .child(Input::new(state).focus_bordered(false).w_full())
}

fn value<'a>(record: &'a Value, key: &str) -> &'a str {
    record.get(key).and_then(Value::as_str).unwrap_or_default()
}

fn title<'a>(record: &'a Value, key: &str, fallback: &'a str) -> &'a str {
    let result = value(record, key);
    if result.is_empty() { fallback } else { result }
}

fn records<'a>(this: &'a Workbench, path: &str, key: &str) -> &'a [Value] {
    this.control_value(path)
        .and_then(|data| data.get(key))
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn load_state(
    this: &Workbench,
    path: &str,
    colors: &Palette,
    no_items: &str,
    has_items: bool,
) -> Option<AnyElement> {
    if let Some(message) = this.control_error(path) {
        return Some(
            error(colors, message.to_owned())
                .px(px(16.))
                .py(px(12.))
                .into_any_element(),
        );
    }
    if has_items {
        return None;
    }
    let message = if this.control_pending(path) {
        "Loading…"
    } else if this.control_value(path).is_none() {
        "This section hasn’t loaded. Refresh to try again."
    } else {
        no_items
    };
    Some(empty(colors, message.to_owned()).into_any_element())
}

fn action_error(this: &Workbench, path: &str, colors: &Palette) -> Option<AnyElement> {
    this.control_action_error(path)
        .map(|message| error(colors, message.to_owned()).into_any_element())
}

fn segment(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b':'))
}

fn encode_query(query: &str) -> String {
    use std::fmt::Write as _;

    let mut output = String::new();
    for byte in query.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            output.push(char::from(byte));
        } else {
            let _ = write!(output, "%{byte:02X}");
        }
    }
    output
}

fn confirm(
    this: &mut Workbench,
    label: &'static str,
    title: &'static str,
    detail: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
    apply: impl FnOnce(&mut Workbench, &mut Context<Workbench>) + 'static,
) {
    let Some(workspace) = this
        .selected_workspace()
        .filter(|_| !this.operations.confirming)
    else {
        return;
    };
    this.operations.confirming = true;
    let decision = window.prompt(
        gpui::PromptLevel::Warning,
        title,
        Some(detail),
        &[
            gpui::PromptButton::ok("Cancel"),
            gpui::PromptButton::new(label),
        ],
        cx,
    );
    cx.spawn(async move |this, cx| {
        let accepted = decision.await == Ok(1);
        let _ = this.update(cx, |this, cx| {
            this.operations.confirming = false;
            if accepted && this.selected_workspace().as_ref() == Some(&workspace) {
                apply(this, cx);
            }
            cx.notify();
        });
    })
    .detach();
}

fn send(
    this: &mut Workbench,
    path: &str,
    body: Option<Value>,
    refresh: &[&str],
    cx: &mut Context<Workbench>,
) {
    this.control_send(ControlMethod::Post, path, body, refresh, cx);
}

#[cfg(test)]
mod tests {
    #[test]
    fn identifiers_cannot_override_a_control_path() {
        assert!(super::segment("job_1:lead"));
        assert!(!super::segment("job/retry"));
        assert!(!super::segment("job%2Fretry"));
        assert!(!super::segment(".."));
        assert!(!super::segment(""));
    }
}
