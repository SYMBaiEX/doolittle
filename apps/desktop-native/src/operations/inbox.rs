use serde_json::json;

use super::*;

pub(super) const HEALTH: &str = "/gateway/state";
pub(super) const INBOX: &str = "/gateway/inbox?limit=100";
const OUTBOX: &str = "/gateway/outbox?limit=100";
const SESSIONS: &str = "/sessions/gateway";
const PAIRING_PENDING: &str = "/pairing/pending";
const PAIRING_APPROVED: &str = "/pairing/approved";

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum InboxTab {
    #[default]
    Incoming,
    Outgoing,
    Threads,
    Pairing,
}

impl InboxTab {
    fn routes(self) -> &'static [&'static str] {
        match self {
            Self::Incoming => &[INBOX],
            Self::Outgoing => &[OUTBOX],
            Self::Threads => &[SESSIONS],
            Self::Pairing => &[PAIRING_PENDING, PAIRING_APPROVED],
        }
    }
}

#[derive(Default)]
pub(super) struct InboxState {
    tab: InboxTab,
    latest_action: Option<(&'static str, &'static str)>,
    query: String,
}

pub(super) fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    this.control_get(HEALTH, cx);
    for &path in this.operations.inbox.tab.routes() {
        this.control_get(path, cx);
    }
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let search = this.operations.input(
        "inbox-filter",
        "Search messages or connectors",
        false,
        window,
        cx,
    );
    let active = this.operations.inbox.tab;
    let latest = this.operations.inbox.latest_action;
    let pending = latest.is_some_and(|(path, _)| this.control_action_pending(path));
    let gateway = this
        .control_value(HEALTH)
        .and_then(|payload| payload.get("state"));
    let body = match active {
        InboxTab::Incoming => message_list(this, colors, INBOX, "inbox", pending, cx),
        InboxTab::Outgoing => message_list(this, colors, OUTBOX, "outbox", pending, cx),
        InboxTab::Threads => threads(this, colors),
        InboxTab::Pairing => pairings(this, colors, pending, cx),
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            row(colors)
                .child(
                    group().children(
                        [
                            (InboxTab::Incoming, "Incoming"),
                            (InboxTab::Outgoing, "Outgoing"),
                            (InboxTab::Threads, "Thread routes"),
                            (InboxTab::Pairing, "Pairing"),
                        ]
                        .into_iter()
                        .map(|(next, label)| {
                            tab(("inbox-tab", label), label, active == next).on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.operations.inbox.tab = next;
                                    for &path in next.routes() {
                                        this.control_get(path, cx);
                                    }
                                    cx.notify();
                                },
                            ))
                        }),
                    ),
                )
                .when_some(
                    gateway.and_then(|state| state["running"].as_bool()),
                    |row, running| row.child(gateway_controls(running, pending, colors, cx)),
                )
                .when(
                    matches!(active, InboxTab::Incoming | InboxTab::Outgoing),
                    |row| {
                        row.child(
                            group()
                                .child(div().min_w(px(190.)).flex_1().child(Input::new(&search)))
                                .child(
                                    button("inbox-search-apply")
                                        .small()
                                        .outline()
                                        .label("Search")
                                        .on_click(cx.listener(|this, _, _, cx| {
                                            this.operations.inbox.query = this
                                                .operations
                                                .value("inbox-filter", cx)
                                                .chars()
                                                .take(128)
                                                .collect::<String>()
                                                .to_lowercase();
                                            cx.notify();
                                        })),
                                ),
                        )
                    },
                )
                .children(
                    this.control_error(HEALTH)
                        .map(|message| error(colors, message.to_owned())),
                )
                .children(latest.and_then(|(path, label)| {
                    action_error(this, path, colors).or_else(|| {
                        if pending {
                            Some(muted(colors, "Updating gateway…").into_any_element())
                        } else {
                            this.control_action_value(path)
                                .map(|_| muted(colors, label).into_any_element())
                        }
                    })
                })),
        )
        .child(scroll("gateway-operations-list").child(body))
        .into_any_element()
}

fn gateway_controls(
    running: bool,
    pending: bool,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let commands = if running {
        &[
            ("Restart", "/gateway/restart", "Gateway restarted."),
            ("Stop", "/gateway/stop", "Gateway stopped."),
        ][..]
    } else {
        &[("Start", "/gateway/start", "Gateway start returned.")][..]
    };
    group()
        .child(status(colors, if running { "online" } else { "stopped" }))
        .children(commands.iter().map(|&(label, path, receipt)| {
            button(path)
                .small()
                .outline()
                .label(label)
                .disabled(pending)
                .on_click(cx.listener(move |_, _, window, cx| {
                    confirm(
                        label,
                        "Change gateway state?",
                        "This affects connectors for this native profile.",
                        window,
                        cx,
                        move |this, cx| action(this, path, json!({}), receipt, &[HEALTH], cx),
                    );
                }))
        }))
}

fn message_list(
    this: &Workbench,
    colors: &Palette,
    path: &'static str,
    key: &'static str,
    pending: bool,
    cx: &mut Context<Workbench>,
) -> Div {
    let query = &this.operations.inbox.query;
    let items: Vec<_> = records(this, path, key)
        .iter()
        .filter(|entry| {
            query.is_empty()
                || ["textPreview", "platform", "authorName", "status", "roomId"]
                    .into_iter()
                    .any(|field| value(entry, field).to_lowercase().contains(query))
        })
        .collect();
    let incoming = key == "inbox";
    panel(
        colors,
        if incoming {
            "Message history"
        } else {
            "Delivery history"
        },
    )
    .children(load_state(
        this,
        path,
        colors,
        if incoming {
            "No matching incoming messages."
        } else {
            "No matching outgoing deliveries."
        },
        !items.is_empty(),
    ))
    .children(items.iter().map(|entry| {
        let platform = title(entry, "platform", "Connector");
        let state = title(entry, "status", "recorded");
        let name = title(entry, "authorName", platform);
        let preview = title(entry, "textPreview", "No message preview.");
        let id = value(entry, "recordId");
        let (label, endpoint, outcome) = if incoming {
            ("Replay", "/gateway/replay", "Replay requested.")
        } else {
            (
                "Retry",
                "/gateway/delivery/retry",
                "Delivery retry requested.",
            )
        };
        let prompt = format!("{platform} · {state} · {}", value(entry, "at"));
        let record_id = id.to_owned();
        row(colors)
            .child(
                group()
                    .justify_between()
                    .child(heading(name.to_owned()))
                    .child(status(colors, state)),
            )
            .child(preview.to_owned())
            .child(muted(
                colors,
                format!("{} · {}", platform, value(entry, "at")),
            ))
            .when(segment(id) && (incoming || state == "rejected"), |row| {
                row.child(
                    group().child(
                        button(format!("gateway-{key}-{id}"))
                            .small()
                            .outline()
                            .disabled(pending)
                            .label(label)
                            .on_click(cx.listener(move |_, _, window, cx| {
                                let id = record_id.clone();
                                confirm(
                                    label,
                                    if incoming {
                                        "Replay incoming message?"
                                    } else {
                                        "Retry outgoing delivery?"
                                    },
                                    &prompt,
                                    window,
                                    cx,
                                    move |this, cx| {
                                        action(
                                            this,
                                            endpoint,
                                            json!({"recordId": id}),
                                            outcome,
                                            &[HEALTH, INBOX, OUTBOX],
                                            cx,
                                        )
                                    },
                                );
                            })),
                    ),
                )
            })
    }))
}

fn threads(this: &Workbench, colors: &Palette) -> Div {
    let entries = records(this, SESSIONS, "sessions");
    panel(colors, "Connector session routes")
        .children(load_state(
            this,
            SESSIONS,
            colors,
            "No connector threads.",
            !entries.is_empty(),
        ))
        .children(entries.iter().map(|entry| {
            row(colors)
                .child(heading(
                    title(entry, "platform", "Connector session").to_owned(),
                ))
                .child(muted(
                    colors,
                    format!(
                        "{} · {}",
                        title(entry, "sessionId", value(entry, "key")),
                        value(entry, "updatedAt")
                    ),
                ))
        }))
}

fn pairings(this: &Workbench, colors: &Palette, pending: bool, cx: &mut Context<Workbench>) -> Div {
    let requests = records(this, PAIRING_PENDING, "requests");
    let approved = records(this, PAIRING_APPROVED, "approved");
    div()
        .child(
            panel(colors, "Pending pairings")
                .children(load_state(
                    this,
                    PAIRING_PENDING,
                    colors,
                    "No pairing requests.",
                    !requests.is_empty(),
                ))
                .children(
                    requests
                        .iter()
                        .map(|entry| pairing_row(entry, true, pending, colors, cx)),
                ),
        )
        .child(
            panel(colors, "Approved senders")
                .children(load_state(
                    this,
                    PAIRING_APPROVED,
                    colors,
                    "No approved senders.",
                    !approved.is_empty(),
                ))
                .children(
                    approved
                        .iter()
                        .map(|entry| pairing_row(entry, false, pending, colors, cx)),
                ),
        )
}

fn pairing_row(
    entry: &Value,
    requested: bool,
    pending: bool,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let name = title(
        entry,
        "userName",
        title(entry, "username", value(entry, "userId")),
    );
    let platform = value(entry, "platform");
    let (field, identity) = if requested {
        ("code", value(entry, "code"))
    } else {
        ("userId", value(entry, "userId"))
    };
    let choices: &[(&str, &str, &str)] = if requested {
        &[
            ("Approve", "/pairing/approve", "Sender approved."),
            ("Deny", "/pairing/deny", "Pairing denied."),
        ]
    } else {
        &[("Revoke", "/pairing/revoke", "Sender access revoked.")]
    };
    row(colors)
        .child(heading(name.to_owned()))
        .child(muted(colors, platform.to_owned()))
        .when(!identity.is_empty() && !platform.is_empty(), |row| {
            row.child(
                group().children(choices.iter().map(|&(label, path, outcome)| {
                    let body = json!({"platform": platform, (field): identity});
                    let description = format!("{platform} · {name}");
                    button(format!("{path}-{platform}-{identity}"))
                        .small()
                        .outline()
                        .disabled(pending)
                        .label(label)
                        .on_click(cx.listener(move |_, _, window, cx| {
                            let body = body.clone();
                            let title = match label {
                                "Approve" => "Approve sender?",
                                "Deny" => "Deny pairing request?",
                                _ => "Revoke sender access?",
                            };
                            confirm(label, title, &description, window, cx, move |this, cx| {
                                action(
                                    this,
                                    path,
                                    body,
                                    outcome,
                                    &[PAIRING_PENDING, PAIRING_APPROVED],
                                    cx,
                                )
                            });
                        }))
                })),
            )
        })
}

fn action(
    this: &mut Workbench,
    path: &'static str,
    body: Value,
    outcome: &'static str,
    refresh: &[&str],
    cx: &mut Context<Workbench>,
) {
    if this
        .operations
        .inbox
        .latest_action
        .is_some_and(|(path, _)| this.control_action_pending(path))
    {
        return;
    }
    this.operations.inbox.latest_action = Some((path, outcome));
    send(this, path, Some(body), refresh, cx);
    cx.notify();
}
