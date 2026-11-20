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
    AnyElement, App, AppContext as _, Context, Div, Entity, FontWeight, Window, div, prelude::*, px,
};
use gpui_component::{
    Disableable as _, Selectable as _, Sizable as _,
    button::{Button, ButtonVariants as _},
    input::{Input, InputState},
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
            Self::Home => "Home",
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

    pub(crate) const fn routes(self) -> &'static [&'static str] {
        match self {
            Self::Home => home::HOME_ROUTES,
            Self::Activity => &[activity::FEED],
            Self::Insights => home::INSIGHTS_ROUTES,
            Self::Media => &[media::LIBRARY],
            Self::Work => &[work::OVERVIEW, work::TASKS],
            Self::Review => &[
                work::APPROVALS,
                work::CHAT_RUNS,
                review::RECORD,
                review::CHANGES,
                review::REPOSITORY,
            ],
            Self::Automations => &[automation::JOBS, automation::RUNS],
            Self::Agents => &[work::IDENTITY, agents::BOTS, work::WORKERS],
            Self::Inbox => &[inbox::HEALTH, inbox::INBOX],
        }
    }

    fn detail(self) -> &'static str {
        match self {
            Self::Home => "Pick up recent work and check what needs attention.",
            Self::Activity => "Run outcomes, workspace changes, and runtime events.",
            Self::Insights => "Local conversation usage and runtime inventory.",
            Self::Media => "Images, recordings, and videos created in your workspace.",
            Self::Work => "Queue objectives and follow their execution.",
            Self::Review => "Inspect execution requests and completed runs.",
            Self::Automations => "Manage triggers and inspect their runs.",
            Self::Agents => "Manage isolated agents and inspect delegated work.",
            Self::Inbox => "Track incoming messages and delivery outcomes.",
        }
    }
}

#[derive(Default)]
pub(crate) struct OperationsState {
    inputs: HashMap<&'static str, Entity<InputState>>,
    activity: activity::ActivityState,
    agents: agents::AgentsState,
    automation: automation::AutomationState,
    inbox: inbox::InboxState,
    media: media::MediaState,
    review: review::ReviewState,
    work: work::WorkState,
}

impl OperationsState {
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
    let body = if this.ready() {
        match page {
            OpsPage::Home => home::render(this, colors, cx),
            OpsPage::Activity => activity::render(this, colors, window, cx),
            OpsPage::Insights => home::insights(this, colors, cx),
            OpsPage::Media => media::render(this, colors, window, cx),
            OpsPage::Work => work::render(this, colors, window, cx),
            OpsPage::Review => work::review(this, colors, window, cx),
            OpsPage::Automations => automation::render(this, colors, window, cx),
            OpsPage::Agents => work::agents(this, colors, window, cx),
            OpsPage::Inbox => inbox::render(this, colors, window, cx),
        }
    } else {
        empty(colors, "This workspace needs a running ElizaOS runtime.").into_any_element()
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
                .items_center()
                .justify_between()
                .gap(px(12.))
                .py(px(12.))
                .px(px(16.))
                .border_b_1()
                .border_color(colors.divider)
                .child(
                    div()
                        .flex()
                        .flex_col()
                        .min_w_0()
                        .gap(px(2.))
                        .child(
                            div()
                                .text_size(px(20.))
                                .font_weight(FontWeight::SEMIBOLD)
                                .child(page.label()),
                        )
                        .child(muted(colors, page.detail())),
                )
                .child(
                    Button::new("ops-refresh")
                        .small()
                        .outline()
                        .label("Refresh")
                        .disabled(!this.ready())
                        .on_click(cx.listener(move |this, _, _, cx| refresh(page, this, cx))),
                ),
        )
        .child(body)
        .into_any_element()
}

pub(crate) fn refresh(page: OpsPage, this: &mut Workbench, cx: &mut Context<Workbench>) {
    match page {
        OpsPage::Activity => activity::refresh(this, cx),
        OpsPage::Media => media::refresh(this, cx),
        OpsPage::Work => work::refresh(this, cx),
        OpsPage::Inbox => inbox::refresh(this, cx),
        _ => {
            for path in page.routes() {
                this.control_get(path, cx);
            }
        }
    }
    if page == OpsPage::Review {
        review::refresh(this, cx);
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
    div().child(
        div()
            .px(px(16.))
            .py(px(9.))
            .border_b_1()
            .border_color(colors.divider)
            .bg(colors.rail)
            .font_weight(FontWeight::SEMIBOLD)
            .text_size(px(13.))
            .child(title),
    )
}

fn row(colors: &Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(5.))
        .px(px(16.))
        .py(px(11.))
        .border_b_1()
        .border_color(colors.divider)
}

fn heading(title: impl Into<gpui::SharedString>) -> Div {
    div()
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
    muted(colors, text).px(px(16.)).py(px(18.))
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
    div().flex().flex_wrap().items_center().gap(px(6.))
}

fn button(id: impl Into<gpui::SharedString>) -> Button {
    Button::new(id.into())
}

fn tab(id: (&str, &str), label: &'static str, selected: bool) -> Button {
    button(format!("{}-{}", id.0, id.1))
        .small()
        .ghost()
        .selected(selected)
        .label(label)
}

fn field(state: &Entity<InputState>, label: &'static str, colors: &Palette) -> Div {
    div()
        .flex()
        .flex_col()
        .gap(px(4.))
        .min_w_0()
        .child(muted(colors, label))
        .child(Input::new(state).w_full())
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
    let message = if this.control_pending(path) || this.control_value(path).is_none() {
        "Loading…"
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
    label: &'static str,
    title: &'static str,
    detail: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
    apply: impl FnOnce(&mut Workbench, &mut Context<Workbench>) + 'static,
) {
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
        if decision.await == Ok(1) {
            let _ = this.update(cx, apply);
        }
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
