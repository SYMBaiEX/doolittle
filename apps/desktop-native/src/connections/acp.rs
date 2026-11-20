use std::{
    collections::{HashMap, VecDeque},
    time::Duration,
};

use doolittle_runtime::ControlMethod;
use gpui::{Context, Div, FontWeight, SharedString, Window, div, prelude::*, px};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputState},
};
use serde_json::{Value, json};

use super::{
    ConnectionsPage, action_status, column, flag, input_field, muted, notice, panel, read_status,
    request_action, row, settings::item_row, text_at, value, values,
};
use crate::{ui::Palette, workbench::Workbench};

const STATUS: &str = "/acp/status";
const REGISTRY: &str = "/acp/registry";
const SESSIONS: &str = "/acp/sessions?limit=30";
const NEW: &str = "/acp/session/new";
const LOAD: &str = "/acp/session/load";
const PROMPT: &str = "/acp/session/prompt";
const CANCEL: &str = "/acp/session/cancel";
const PROBE: &str = "/acp/probe";
const MAX_PROMPT_BYTES: usize = 64 * 1024;
const MAX_LINES: usize = 100;
const MAX_LINE_BYTES: usize = 64 * 1024;

pub(super) const ROUTES: &[&str] = &[STATUS, REGISTRY, SESSIONS];

#[derive(Default)]
pub(super) struct PanelState {
    selected: Option<String>,
    transcripts: HashMap<String, Transcript>,
    choosing: Option<OpenSession>,
    turn: Turn,
    polling: bool,
    error: Option<String>,
    outcome: Option<&'static str>,
    cancel_requested: bool,
}

enum OpenSession {
    New,
    Resume(String),
}

#[derive(Default, PartialEq, Eq)]
enum Turn {
    #[default]
    Idle,
    Running,
    Unconfirmed,
}

#[derive(Default)]
struct Transcript {
    cursor: u64,
    gap: bool,
    lines: VecDeque<Line>,
    draft: String,
}

struct Line {
    kind: &'static str,
    text: String,
    identity: Option<String>,
}

pub(super) fn render(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let status = workbench
        .control_value(STATUS)
        .and_then(|value| value.get("acp"));
    let registry = workbench
        .control_value(REGISTRY)
        .and_then(|value| value.get("registry"));
    let list = workbench
        .control_value(SESSIONS)
        .and_then(|value| value.get("sessions"));
    let list_loaded = list.is_some();
    let ready = workbench.ready() && !workbench.needs_workspace();
    let can_change = ready
        && workbench.connections.acp.choosing.is_none()
        && workbench.connections.acp.turn == Turn::Idle;
    let session = workbench.connections.acp.selected.clone();
    let mut ids = values(list, "recentSessionIds")
        .iter()
        .filter_map(Value::as_str)
        .filter(|id| valid_session(id))
        .map(str::to_owned)
        .collect::<Vec<_>>();
    for id in workbench.connections.acp.transcripts.keys() {
        if !ids.contains(id) {
            ids.push(id.clone());
        }
    }
    let profile = status
        .and_then(|status| status.get("protocolVersion"))
        .and_then(Value::as_u64)
        .map(|version| format!("Protocol {version}"))
        .unwrap_or_else(|| "Awaiting runtime".into());
    let mut overview = panel(colors, "ACP sessions")
        .child(
            row().justify_between().child(muted(colors, profile)).child(
                Button::new("acp-session-new")
                    .small()
                    .primary()
                    .label(if workbench.connections.acp.choosing.is_some() {
                        "Opening…"
                    } else {
                        "New ACP session"
                    })
                    .disabled(!can_change)
                    .on_click(cx.listener(|this, _, _, cx| open(this, OpenSession::New, cx))),
            ),
        )
        .when_some(text_at(registry, "description"), |section, description| {
            section.child(muted(colors, description.to_owned()))
        })
        .child(item_row(colors, "Workspace", workbench.workspace_path()))
        .when_some(read_status(workbench, STATUS, colors), |section, status| {
            section.child(status)
        })
        .child(
            row().child(
                request_action(
                    "probe-acp",
                    "Probe ACP connection",
                    ready && !workbench.control_action_pending(PROBE),
                    (ControlMethod::Post, PROBE),
                    Some(json!({})),
                    &[STATUS],
                    cx,
                )
                .ghost(),
            ),
        )
        .when_some(
            action_status(workbench, PROBE, "ACP probe completed.", colors),
            |section, status| section.child(status),
        );
    if let Some(error) = workbench.connections.acp.error.as_deref() {
        overview = overview.child(notice(colors, error.to_owned(), true));
    }
    let resume = input_field(
        workbench,
        "acp-resume-id",
        "",
        "ACP or conversation ID",
        false,
        window,
        cx,
    );
    let mut recent = panel(colors, "Recent ACP sessions")
        .child(
            row()
                .items_end()
                .child(
                    super::field("ACP or conversation ID", &resume, colors, can_change)
                        .flex_1()
                        .min_w(px(180.)),
                )
                .child(
                    Button::new("acp-resume-by-id")
                        .small()
                        .label("Resume by ID")
                        .disabled(!can_change)
                        .on_click(cx.listener(|this, _, _, cx| {
                            let id = value(this, "acp-resume-id", cx);
                            let id = id.trim();
                            if valid_session(id) {
                                open(this, OpenSession::Resume(id.to_owned()), cx);
                            } else {
                                this.connections.set_feedback(
                                    ConnectionsPage::Interfaces,
                                    "Enter a valid ACP or conversation ID.",
                                );
                                cx.notify();
                            }
                        })),
                ),
        )
        .when_some(
            read_status(workbench, SESSIONS, colors),
            |section, status| section.child(status),
        )
        .when(ids.is_empty() && list_loaded, |section| {
            section.child(muted(colors, "No ACP sessions yet."))
        });
    for id in ids {
        let chosen = session.as_deref() == Some(id.as_str());
        let title = if chosen { "Current" } else { "Resume" };
        recent = recent.child(
            row()
                .justify_between()
                .child(muted(colors, id.clone()))
                .child(
                    Button::new(SharedString::from(format!("acp-resume-{id}")))
                        .small()
                        .ghost()
                        .label(title)
                        .disabled(chosen || !can_change)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            open(this, OpenSession::Resume(id.clone()), cx)
                        })),
                ),
        );
    }
    let conversation = session.map(|session| conversation(workbench, &session, colors, window, cx));
    column(0.)
        .child(overview)
        .when_some(conversation, |section, conversation| {
            section.child(conversation)
        })
        .child(recent)
}

fn conversation(
    workbench: &mut Workbench,
    id: &str,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let draft = workbench
        .connections
        .acp
        .transcripts
        .get(id)
        .map(|transcript| transcript.draft.clone())
        .unwrap_or_default();
    let input = input_field(
        workbench,
        "acp-compose",
        &draft,
        "Message for the ACP agent",
        false,
        window,
        cx,
    );
    let can_edit = workbench.ready()
        && workbench.connections.acp.turn == Turn::Idle
        && workbench.connections.acp.choosing.is_none();
    let can_send = can_edit && !input.read(cx).value().trim().is_empty();
    let pending = workbench.connections.acp.turn == Turn::Running;
    let uncertain = workbench.connections.acp.turn == Turn::Unconfirmed;
    let updates = update_path(id);
    let status = read_status(workbench, &updates, colors);
    let transcript = workbench.connections.acp.transcripts.get(id);
    let mut section = panel(colors, "ACP conversation").child(
        row()
            .justify_between()
            .child(muted(colors, id.to_owned()))
            .child(
                Button::new("refresh-acp-updates")
                    .small()
                    .ghost()
                    .label("Refresh updates")
                    .disabled(workbench.control_pending(&updates))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.control_get(&updates, cx);
                        ensure_poller(this, cx);
                    })),
            ),
    );
    if let Some(status) = status {
        section = section.child(status);
    }
    if let Some(transcript) = transcript {
        if transcript.gap {
            section = section.child(notice(
                colors,
                "Some earlier updates expired from the bridge history.",
                false,
            ));
        }
        if !transcript.lines.is_empty() {
            section = section.child(
                div()
                    .id("acp-transcript")
                    .max_h(px(380.))
                    .overflow_y_scroll()
                    .bg(colors.rail)
                    .rounded(px(5.))
                    .p(px(10.))
                    .child(column(8.).children(transcript.lines.iter().map(|line| {
                        column(2.)
                            .child(
                                div()
                                    .font_weight(FontWeight::MEDIUM)
                                    .text_sm()
                                    .child(line.kind),
                            )
                            .child(div().text_sm().child(line.text.clone()))
                    }))),
            );
        }
    }
    if transcript.is_none_or(|transcript| transcript.lines.is_empty()) && !pending && !uncertain {
        section = section.child(muted(
            colors,
            "Send a message to start this ACP conversation.",
        ));
    }
    if let Some(outcome) = workbench.connections.acp.outcome {
        section = section.child(muted(colors, outcome));
    }
    if pending {
        section = section.child(muted(colors, "ACP turn is running…"));
    } else if uncertain {
        section = section.child(notice(colors,
            "The response could not be confirmed. Check updates or cancel before sending another message.", true));
        if let Some(error) = workbench.control_action_error(PROMPT) {
            section = section.child(muted(colors, error.to_owned()));
        }
    }
    section = section.child(
        row()
            .child(
                Input::new(&input)
                    .focus_bordered(false)
                    .flex_1()
                    .disabled(!can_edit),
            )
            .child(
                Button::new("send-acp-prompt")
                    .small()
                    .primary()
                    .label("Send")
                    .disabled(!can_send)
                    .on_click(cx.listener(|this, _, window, cx| send(this, window, cx))),
            )
            .when(pending || uncertain, |actions| {
                actions.child(
                    Button::new("cancel-acp-prompt")
                        .small()
                        .ghost()
                        .label("Cancel turn")
                        .disabled(workbench.control_action_pending(CANCEL))
                        .on_click(cx.listener(|this, _, _, cx| cancel(this, cx))),
                )
            }),
    );
    section.when_some(
        workbench
            .control_action_error(CANCEL)
            .filter(|_| workbench.connections.acp.cancel_requested),
        |section, error| section.child(notice(colors, error.to_owned(), true)),
    )
}

fn open(this: &mut Workbench, choice: OpenSession, cx: &mut Context<Workbench>) {
    if this.connections.acp.choosing.is_some() || this.connections.acp.turn != Turn::Idle {
        return;
    }
    let Some(cwd) = this.selected_workspace() else {
        return;
    };
    let Some(cwd) = cwd.to_str() else {
        return;
    };
    this.connections
        .feedback
        .remove(&ConnectionsPage::Interfaces);
    this.connections.acp.outcome = None;
    this.connections.acp.error = None;
    if let OpenSession::Resume(id) = &choice
        && this.connections.acp.transcripts.contains_key(id)
    {
        select(this, id.clone(), cx);
        this.control_get(&update_path(id), cx);
        ensure_poller(this, cx);
        return;
    }
    let (path, body) = match &choice {
        OpenSession::New => (NEW, json!({"cwd":cwd,"mcpServers":[]})),
        OpenSession::Resume(id) => (LOAD, json!({"sessionId":id,"cwd":cwd,"mcpServers":[]})),
    };
    this.connections.acp.choosing = Some(choice);
    this.control_send(ControlMethod::Post, path, Some(body), &[SESSIONS], cx);
    ensure_poller(this, cx);
}

fn select(this: &mut Workbench, id: String, cx: &mut Context<Workbench>) {
    if this.connections.acp.selected.as_ref() == Some(&id) {
        return;
    }
    if let Some(previous) = this.connections.acp.selected.take() {
        let draft = value(this, "acp-compose", cx);
        this.connections
            .acp
            .transcripts
            .entry(previous)
            .or_default()
            .draft = draft;
    }
    this.connections.fields.remove("acp-compose");
    this.connections.acp.selected = Some(id);
}

fn send(this: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let Some(id) = this.connections.acp.selected.clone() else {
        return;
    };
    if this.connections.acp.turn != Turn::Idle || this.connections.acp.choosing.is_some() {
        return;
    }
    let draft = value(this, "acp-compose", cx);
    let message = draft.trim();
    if message.is_empty() || message.len() > MAX_PROMPT_BYTES || message.contains('\0') {
        this.connections.set_feedback(
            ConnectionsPage::Interfaces,
            "Enter a message of up to 64 KiB.",
        );
        cx.notify();
        return;
    }
    if let Some(field) = this.connections.fields.get("acp-compose") {
        field.input.update(cx, |input: &mut InputState, cx| {
            input.set_value("", window, cx)
        });
    }
    this.connections
        .feedback
        .remove(&ConnectionsPage::Interfaces);
    this.connections.acp.outcome = None;
    this.connections.acp.error = None;
    this.connections.acp.cancel_requested = false;
    this.connections.acp.turn = Turn::Running;
    let transcript = this
        .connections
        .acp
        .transcripts
        .entry(id.clone())
        .or_default();
    transcript.draft.clear();
    transcript.push("You", message, None);
    this.control_send(
        ControlMethod::Post,
        PROMPT,
        Some(json!({"sessionId":id,"prompt":[{"type":"text","text":message}]})),
        &[SESSIONS],
        cx,
    );
    ensure_poller(this, cx);
}

fn cancel(this: &mut Workbench, cx: &mut Context<Workbench>) {
    let Some(id) = this.connections.acp.selected.clone() else {
        return;
    };
    this.connections.acp.cancel_requested = true;
    this.control_send(
        ControlMethod::Post,
        CANCEL,
        Some(json!({"sessionId":id})),
        &[],
        cx,
    );
    ensure_poller(this, cx);
}

fn ensure_poller(this: &mut Workbench, cx: &mut Context<Workbench>) {
    if this.connections.acp.polling {
        return;
    }
    this.connections.acp.polling = true;
    cx.spawn(async move |this, cx| {
        loop {
            cx.background_executor()
                .timer(Duration::from_millis(850))
                .await;
            let Ok(keep) = this.update(cx, tick) else {
                break;
            };
            if !keep {
                break;
            }
        }
    })
    .detach();
}

fn tick(this: &mut Workbench, cx: &mut Context<Workbench>) -> bool {
    if let Some(choice) = this.connections.acp.choosing.take() {
        let route = match &choice {
            OpenSession::New => NEW,
            OpenSession::Resume(_) => LOAD,
        };
        if this.control_action_pending(route) {
            this.connections.acp.choosing = Some(choice);
            return true;
        }
        let outcome = this.control_action_value(route);
        let id = match &choice {
            OpenSession::New => text_at(outcome.and_then(|data| data.get("session")), "sessionId")
                .filter(|id| valid_session(id))
                .map(str::to_owned),
            OpenSession::Resume(id) => flag(outcome, "loaded").then(|| id.clone()),
        };
        if let Some(id) = id {
            select(this, id.clone(), cx);
            this.connections
                .acp
                .transcripts
                .entry(id.clone())
                .or_default();
            this.control_get(&update_path(&id), cx);
            cx.notify();
            return true;
        }
        let message = this
            .control_action_error(route)
            .unwrap_or("The ACP session could not be confirmed.")
            .to_owned();
        this.connections.acp.error = Some(message);
    }
    let Some(id) = this.connections.acp.selected.clone() else {
        this.connections.acp.polling = false;
        cx.notify();
        return false;
    };
    let update_path = update_path(&id);
    let snapshot = this
        .control_value(&update_path)
        .and_then(|result| result.get("snapshot"))
        .cloned();
    if let Some(snapshot) = snapshot {
        this.connections
            .acp
            .transcripts
            .entry(id.clone())
            .or_default()
            .consume(&id, &snapshot);
    }
    if this.connections.acp.turn == Turn::Running && !this.control_action_pending(PROMPT) {
        let terminal = this
            .control_action_value(PROMPT)
            .and_then(|payload| payload.get("result"))
            .cloned();
        if let Some(terminal) = terminal {
            this.connections
                .acp
                .transcripts
                .entry(id.clone())
                .or_default()
                .consume_updates(&id, values(Some(&terminal), "updates"));
            this.connections.acp.outcome = Some(
                if text_at(Some(&terminal), "stopReason") == Some("cancelled") {
                    "ACP turn cancelled."
                } else {
                    "ACP turn completed."
                },
            );
            this.connections.acp.turn = Turn::Idle;
            this.control_get(&update_path, cx);
        } else {
            this.connections.acp.turn = Turn::Unconfirmed;
        }
    }
    if this.connections.acp.turn == Turn::Unconfirmed
        && this.connections.acp.cancel_requested
        && !this.control_action_pending(CANCEL)
        && flag(this.control_action_value(CANCEL), "cancelled")
    {
        this.connections.acp.turn = Turn::Idle;
        this.connections.acp.outcome = Some("ACP accepted the cancellation request.");
        this.control_get(&update_path, cx);
    }
    if this.connections.acp.turn == Turn::Running && !this.control_pending(&update_path) {
        this.control_get(&update_path, cx);
    }
    let keep = this.connections.acp.turn == Turn::Running
        || this.control_pending(&update_path)
        || this.control_action_pending(CANCEL);
    this.connections.acp.polling = keep;
    cx.notify();
    keep
}

fn update_path(id: &str) -> String {
    let query = url::form_urlencoded::Serializer::new(String::new())
        .append_pair("sessionId", id)
        .finish();
    format!("/acp/session/updates?{query}")
}

fn valid_session(id: &str) -> bool {
    let uuid = id.strip_prefix("acp:").unwrap_or(id);
    uuid.len() == 36 && uuid::Uuid::parse_str(uuid).is_ok()
}

impl Transcript {
    fn consume(&mut self, id: &str, snapshot: &Value) {
        if text_at(Some(snapshot), "sessionId") != Some(id) {
            return;
        }
        self.consume_updates(id, values(Some(snapshot), "updates"));
    }

    fn consume_updates(&mut self, id: &str, entries: &[Value]) {
        for record in entries {
            let Some(cursor) = record.get("cursor").and_then(Value::as_u64) else {
                continue;
            };
            if cursor <= self.cursor || text_at(Some(record), "sessionId") != Some(id) {
                continue;
            }
            self.gap |= cursor > self.cursor.saturating_add(1);
            self.cursor = cursor;
            let Some(update) = record.get("update") else {
                continue;
            };
            match text_at(Some(update), "sessionUpdate") {
                Some(kind @ ("agent_message_chunk" | "user_message_chunk")) => {
                    let label = if kind == "agent_message_chunk" {
                        "Assistant"
                    } else {
                        "You"
                    };
                    if let Some(text) = update.pointer("/content/text").and_then(Value::as_str) {
                        let identity = text_at(Some(update), "messageId");
                        if label == "Assistant"
                            && let Some(line) = self.lines.back_mut().filter(|line| {
                                line.kind == label && line.identity.as_deref() == identity
                            })
                        {
                            append_bounded(&mut line.text, text);
                            continue;
                        }
                        self.push(label, text, identity);
                    }
                }
                Some("tool_call") => {
                    if let Some(title) = text_at(Some(update), "title") {
                        self.push("Tool", title, text_at(Some(update), "toolCallId"));
                    }
                }
                _ => {}
            }
        }
    }

    fn push(&mut self, kind: &'static str, text: &str, identity: Option<&str>) {
        let mut escaped = String::new();
        append_bounded(&mut escaped, text);
        if self.lines.len() >= MAX_LINES {
            self.lines.pop_front();
            self.gap = true;
        }
        self.lines.push_back(Line {
            kind,
            text: escaped,
            identity: identity.map(str::to_owned),
        });
    }
}

fn append_bounded(output: &mut String, text: &str) {
    let end = text.floor_char_boundary(text.len().min(MAX_LINE_BYTES.saturating_sub(output.len())));
    output.push_str(&text[..end]);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn refuses_cross_session_updates_and_deduplicates_cursor() {
        let mut transcript = Transcript::default();
        let snapshot = json!({"sessionId":"one","updates":[
            {"cursor":1,"sessionId":"one","update":{"sessionUpdate":"agent_message_chunk","content":{"text":"first "}}},
            {"cursor":2,"sessionId":"two","update":{"sessionUpdate":"agent_message_chunk","content":{"text":"foreign"}}},
            {"cursor":3,"sessionId":"one","update":{"sessionUpdate":"agent_message_chunk","content":{"text":"next"}}}
        ]});
        transcript.consume("one", &snapshot);
        transcript.consume("one", &snapshot);
        assert_eq!(transcript.cursor, 3);
        assert!(transcript.gap);
        assert_eq!(transcript.lines.front().unwrap().text, "first next");
    }
    #[test]
    fn acp_update_query_encodes_namespaces() {
        let id = "acp:6958a46a-4a5b-4b1c-8205-38a8cabb6341";
        assert!(valid_session(id));
        assert!(!valid_session("acp:not/safe"));
        assert!(update_path(id).contains("sessionId=acp%3A"));
    }
}
