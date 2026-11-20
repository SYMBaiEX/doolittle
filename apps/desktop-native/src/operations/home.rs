use super::*;
use crate::{connections::ConnectionsPage, workbench::View};

const RUNTIME: &str = "/runtime/status";
const SETUP: &str = "/setup/summary";
const REPO: &str = "/repo/summary";
const ANALYTICS: &str = "/analytics";
const INSIGHTS: &str = "/insights";
const SERVICES: &str = "/runtime/services";

pub(super) const HOME_ROUTES: &[&str] = &[RUNTIME, SETUP, REPO, work::APPROVALS, work::TASKS];
pub(super) const INSIGHTS_ROUTES: &[&str] = &[ANALYTICS, INSIGHTS, SERVICES];

pub(super) fn render(
    this: &Workbench,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let approvals = records(this, work::APPROVALS, "approvals");
    let tasks = records(this, work::TASKS, "tasks");
    let pending = approvals
        .iter()
        .filter(|item| value(item, "status") == "pending")
        .count();
    let running = tasks
        .iter()
        .filter(|item| matches!(value(item, "status"), "running" | "in_progress"))
        .count();
    let current = this.control_value(RUNTIME);
    let repo = this
        .control_value(REPO)
        .and_then(|body| body.get("summary"));
    let setup = this
        .control_value(SETUP)
        .and_then(|body| body.get("summary"));
    scroll("home-overview")
        .child(
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(heading(this.workspace_title()))
                        .child(
                            button("home-new-chat")
                                .small()
                                .primary()
                                .label("New chat")
                                .on_click(cx.listener(|this, _, window, cx| {
                                    this.start_conversation(window, cx)
                                })),
                        ),
                )
                .child(
                    group()
                        .child(destination(
                            "home-review",
                            &format!("Review · {pending} pending"),
                            OpsPage::Review,
                            cx,
                        ))
                        .child(destination(
                            "home-work",
                            &format!("Queue · {running} running"),
                            OpsPage::Work,
                            cx,
                        ))
                        .child(destination(
                            "home-activity",
                            "Activity",
                            OpsPage::Activity,
                            cx,
                        ))
                        .child(destination(
                            "home-insights",
                            "Insights",
                            OpsPage::Insights,
                            cx,
                        )),
                )
                .children(
                    [work::APPROVALS, work::TASKS]
                        .into_iter()
                        .filter_map(|path| this.control_error(path))
                        .map(|message| error(colors, message.to_owned())),
                ),
        )
        .child(
            panel(colors, "Recent chats")
                .when(this.sessions.is_empty(), |panel| {
                    panel.child(empty(colors, "Start a conversation to see it here."))
                })
                .children(this.sessions.iter().take(8).map(|session| {
                    let id = session.session_id.clone();
                    let title = session
                        .title
                        .clone()
                        .or_else(|| session.preview.first().cloned());
                    let label = title.clone().unwrap_or_else(|| "Untitled chat".into());
                    row(colors)
                        .child(
                            group().justify_between().child(heading(label)).child(
                                button(format!("continue-chat-{id}"))
                                    .small()
                                    .outline()
                                    .label("Continue")
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        this.select_conversation(
                                            id.clone(),
                                            title.clone(),
                                            window,
                                            cx,
                                        )
                                    })),
                            ),
                        )
                        .child(muted(colors, format!("{} messages", session.message_count)))
                })),
        )
        .child(
            panel(colors, "Runtime and workspace")
                .children(load_state(
                    this,
                    RUNTIME,
                    colors,
                    "No runtime status was returned.",
                    current.is_some(),
                ))
                .when_some(current, |panel, runtime| {
                    panel.child(
                        row(colors).child(
                            group()
                                .child(status(colors, "online"))
                                .child(heading(format!(
                                    "{} · {}",
                                    title(runtime, "provider", "Provider"),
                                    title(runtime, "model", "Model")
                                )))
                                .child(
                                    button("home-models")
                                        .small()
                                        .outline()
                                        .label("Models")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.set_view(
                                                View::Connections(ConnectionsPage::Models),
                                                window,
                                                cx,
                                            )
                                        })),
                                ),
                        ),
                    )
                })
                .when_some(repo, |panel, repo| {
                    panel.child(
                        row(colors)
                            .child(heading(title(repo, "branch", "Working tree").to_owned()))
                            .child(muted(
                                colors,
                                format!(
                                    "{} changed files · {} ahead · {} behind",
                                    count(repo, "changedFiles"),
                                    count(repo, "ahead"),
                                    count(repo, "behind")
                                ),
                            )),
                    )
                })
                .when_some(setup, |panel, setup| {
                    panel.child(
                        row(colors).child(
                            group()
                                .child(heading(title(setup, "status", "Setup").to_owned()))
                                .child(
                                    button("home-setup")
                                        .small()
                                        .outline()
                                        .label("Setup details")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.set_view(
                                                View::Connections(ConnectionsPage::Setup),
                                                window,
                                                cx,
                                            )
                                        })),
                                ),
                        ),
                    )
                })
                .children(
                    [REPO, SETUP]
                        .into_iter()
                        .filter_map(|path| this.control_error(path))
                        .map(|message| row(colors).child(error(colors, message.to_owned()))),
                ),
        )
        .into_any_element()
}

fn destination(
    id: &'static str,
    label: &str,
    target: OpsPage,
    cx: &mut Context<Workbench>,
) -> Button {
    button(id)
        .small()
        .outline()
        .label(label.to_owned())
        .on_click(cx.listener(move |this, _, window, cx| {
            this.set_view(View::Operations(target), window, cx)
        }))
}

pub(super) fn insights(
    this: &Workbench,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let totals = this
        .control_value(ANALYTICS)
        .and_then(|body| body.get("totals"));
    let days = records(this, ANALYTICS, "dailyActivity");
    let recent = records(this, ANALYTICS, "recentSessions");
    let max_messages = days.iter().map(day_messages).max().unwrap_or(1).max(1);
    let services = this.control_value(SERVICES);
    let insights = this.control_value(INSIGHTS);
    scroll("local-insights")
        .child(
            panel(colors, "Local usage")
                .children(load_state(
                    this,
                    ANALYTICS,
                    colors,
                    "No local activity yet.",
                    totals.is_some(),
                ))
                .when_some(totals, |panel, totals| {
                    panel.child(
                        row(colors).child(
                            group().children(
                                [
                                    ("sessions", "Conversations"),
                                    ("messages", "Messages"),
                                    ("estimatedTokens", "Estimated tokens"),
                                    ("assistantMessages", "Agent replies"),
                                ]
                                .into_iter()
                                .map(|(key, label)| {
                                    div()
                                        .flex_1()
                                        .min_w(px(110.))
                                        .p(px(8.))
                                        .bg(colors.inset)
                                        .rounded(px(5.))
                                        .child(heading(count(totals, key).to_string()))
                                        .child(muted(colors, label))
                                }),
                            ),
                        ),
                    )
                }),
        )
        .child(
            panel(colors, "Messages by day")
                .children(load_state(
                    this,
                    ANALYTICS,
                    colors,
                    "No conversations in the selected window.",
                    !days.is_empty(),
                ))
                .children(days.iter().take(31).map(|day| {
                    let messages = day_messages(day);
                    row(colors).child(
                        group()
                            .child(
                                div()
                                    .w(px(105.))
                                    .flex_none()
                                    .child(title(day, "date", title(day, "day", "Day")).to_owned()),
                            )
                            .child(
                                div()
                                    .flex_1()
                                    .h(px(8.))
                                    .rounded(px(3.))
                                    .bg(colors.inset)
                                    .child(
                                        div()
                                            .h_full()
                                            .w(gpui::relative(
                                                messages as f32 / max_messages as f32,
                                            ))
                                            .bg(colors.accent)
                                            .rounded(px(3.)),
                                    ),
                            )
                            .child(
                                div()
                                    .min_w(px(44.))
                                    .text_right()
                                    .child(messages.to_string()),
                            ),
                    )
                })),
        )
        .child(
            panel(colors, "Recent conversations")
                .children(load_state(
                    this,
                    ANALYTICS,
                    colors,
                    "No recorded conversations.",
                    !recent.is_empty(),
                ))
                .children(recent.iter().take(12).map(|session| {
                    let id = value(session, "sessionId").to_owned();
                    let title = value(session, "title").to_owned();
                    let label = if title.is_empty() {
                        "Untitled chat".to_owned()
                    } else {
                        title.clone()
                    };
                    row(colors)
                        .child(group().justify_between().child(heading(label)).when(
                            segment(&id),
                            |row| {
                                row.child(
                                    button(format!("analytics-session-{id}"))
                                        .small()
                                        .outline()
                                        .label("Open chat")
                                        .on_click(cx.listener(move |this, _, window, cx| {
                                            this.select_conversation(
                                                id.clone(),
                                                (!title.is_empty()).then(|| title.clone()),
                                                window,
                                                cx,
                                            )
                                        })),
                                )
                            },
                        ))
                        .child(muted(
                            colors,
                            format!("{} messages", count(session, "messageCount")),
                        ))
                })),
        )
        .child(
            panel(colors, "ElizaOS inventory")
                .when_some(services, |panel, services| {
                    panel.child(
                        row(colors).child(
                            group()
                                .child(muted(
                                    colors,
                                    format!(
                                        "{} transport records",
                                        member_count(&services["transportInventory"])
                                    ),
                                ))
                                .child(
                                    button("open-inventory")
                                        .small()
                                        .outline()
                                        .label("Runtime details")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.set_view(
                                                View::Connections(ConnectionsPage::Runtime),
                                                window,
                                                cx,
                                            )
                                        })),
                                ),
                        ),
                    )
                })
                .when_some(insights, |panel, insights| {
                    panel.child(row(colors).child(muted(
                        colors,
                        format!(
                            "{} ownership groups · {} ecosystem groups",
                            member_count(&insights["ownership"]),
                            member_count(&insights["ecosystem"])
                        ),
                    )))
                })
                .children(
                    [SERVICES, INSIGHTS]
                        .into_iter()
                        .filter_map(|path| this.control_error(path))
                        .map(|message| row(colors).child(error(colors, message.to_owned()))),
                ),
        )
        .into_any_element()
}

fn count(record: &Value, field: &str) -> u64 {
    record[field].as_u64().unwrap_or(0)
}

fn day_messages(day: &Value) -> u64 {
    day["messages"]
        .as_u64()
        .unwrap_or_else(|| count(day, "messageCount"))
}

fn member_count(value: &Value) -> usize {
    value
        .as_array()
        .map(Vec::len)
        .or_else(|| value.as_object().map(serde_json::Map::len))
        .unwrap_or(0)
}
