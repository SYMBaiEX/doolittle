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
    window: &Window,
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
    let approvals_label = if this.control_value(work::APPROVALS).is_some() {
        format!("Review · {pending} pending")
    } else {
        "Review".into()
    };
    let tasks_label = if this.control_value(work::TASKS).is_some() {
        format!("Work · {running} running")
    } else {
        "Work".into()
    };
    let recent = panel(colors, "Recent chats")
        .when(this.sessions_loading && this.sessions.is_empty(), |panel| {
            panel.child(empty(colors, "Loading conversations…"))
        })
        .when_some(this.session_error.as_ref(), |panel, message| {
            panel.child(
                row(colors).child(error(colors, message.clone())).child(
                    button("home-retry-chats")
                        .small()
                        .outline()
                        .label("Retry conversations")
                        .on_click(cx.listener(|this, _, _, cx| this.refresh_sessions(cx))),
                ),
            )
        })
        .when(
            !this.sessions_loading && this.session_error.is_none() && this.sessions.is_empty(),
            |panel| {
                panel.child(empty(
                    colors,
                    "Your conversations will appear here once you send a message.",
                ))
            },
        )
        .children(this.sessions.iter().take(8).map(|session| {
            let id = session.session_id.clone();
            let title = session
                .title
                .clone()
                .or_else(|| session.preview.first().cloned());
            let label = title.clone().unwrap_or_else(|| "Untitled chat".into());
            row(colors).child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(heading(label))
                            .child(muted(colors, format!("{} messages", session.message_count))),
                    )
                    .child(
                        button(format!("continue-chat-{id}"))
                            .small()
                            .ghost()
                            .label("Open")
                            .on_click(cx.listener(move |this, _, window, cx| {
                                this.select_conversation(id.clone(), title.clone(), window, cx)
                            })),
                    ),
            )
        }));
    let details = workspace_status(this, colors, cx);
    let wide = this.content_width(window, cx) >= px(850.);
    scroll("home-overview")
        .child(
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(heading(this.workspace_title()).text_size(px(17.)))
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
                            approvals_label,
                            OpsPage::Review,
                            cx,
                        ))
                        .child(destination("home-work", tasks_label, OpsPage::Work, cx))
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
        .child(if wide {
            div().flex().child(recent.flex_1()).child(
                details
                    .w(gpui::relative(0.4))
                    .border_l_1()
                    .border_color(colors.divider),
            )
        } else {
            div().child(recent).child(details)
        })
        .into_any_element()
}

fn workspace_status(this: &Workbench, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let current = this.control_value(RUNTIME);
    let repo = this
        .control_value(REPO)
        .and_then(|body| body.get("summary"))
        .filter(|repo| repo.is_object());
    let setup = this
        .control_value(SETUP)
        .and_then(|body| body.pointer("/summary/readiness"))
        .filter(|setup| setup.is_object());
    panel(colors, "Workspace status")
        .children(load_state(
            this,
            RUNTIME,
            colors,
            "No runtime status was returned.",
            current.is_some(),
        ))
        .when_some(current, |panel, runtime| {
            let phase = title(
                &runtime["startup"]["phases"]["runtime"],
                "status",
                "started",
            );
            panel.child(
                row(colors)
                    .child(
                        group()
                            .child(heading("ElizaOS"))
                            .child(status(colors, phase)),
                    )
                    .child(muted(
                        colors,
                        format!(
                            "{} · {}",
                            title(runtime, "provider", "Provider"),
                            title(runtime, "model", "Model")
                        ),
                    ))
                    .child(
                        button("home-models")
                            .small()
                            .ghost()
                            .label("Models")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.set_view(
                                    View::Connections(ConnectionsPage::Models),
                                    window,
                                    cx,
                                )
                            })),
                    ),
            )
        })
        .when_some(repo, |panel, repo| {
            if repo["isRepository"].as_bool() == Some(false) {
                return panel.child(
                    row(colors).child(muted(colors, "This folder is outside a Git repository.")),
                );
            }
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
                    ))
                    .child(
                        button("home-ide")
                            .small()
                            .ghost()
                            .label("Open IDE")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.set_view(View::Ide, window, cx)
                            })),
                    ),
            )
        })
        .when_some(setup, |panel, setup| {
            panel.child(
                row(colors)
                    .child(heading(title(setup, "headline", "Setup").to_owned()))
                    .when(!value(setup, "detail").is_empty(), |row| {
                        row.child(muted(colors, value(setup, "detail").to_owned()))
                    })
                    .child(
                        button("home-setup")
                            .small()
                            .ghost()
                            .label("Setup details")
                            .on_click(cx.listener(|this, _, window, cx| {
                                this.set_view(View::Connections(ConnectionsPage::Setup), window, cx)
                            })),
                    ),
            )
        })
        .children(
            [REPO, SETUP]
                .into_iter()
                .filter_map(|path| this.control_error(path))
                .map(|message| row(colors).child(error(colors, message.to_owned()))),
        )
}

fn destination(
    id: &'static str,
    label: impl Into<gpui::SharedString>,
    target: OpsPage,
    cx: &mut Context<Workbench>,
) -> Button {
    button(id)
        .small()
        .outline()
        .label(label)
        .on_click(cx.listener(move |this, _, window, cx| {
            if target == OpsPage::Review {
                work::show_approvals(this);
            }
            this.set_view(View::Operations(target), window, cx);
        }))
}

pub(super) fn insights(
    this: &Workbench,
    colors: &Palette,
    window: &Window,
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
    let usage = panel(colors, "Local usage")
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
                                .py(px(4.))
                                .child(heading(count(totals, key).to_string()).text_size(px(20.)))
                                .child(muted(colors, label))
                        }),
                    ),
                ),
            )
        });
    let chart = panel(colors, "Messages by day")
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
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.))
                    .child(
                        div()
                            .w(px(88.))
                            .flex_none()
                            .child(title(day, "date", title(day, "day", "Day")).to_owned()),
                    )
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .h(px(6.))
                            .rounded(px(3.))
                            .bg(colors.inset)
                            .child(
                                div()
                                    .h_full()
                                    .w(gpui::relative(messages as f32 / max_messages as f32))
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
        }));
    let recents =
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
            }));
    let inventory = panel(colors, "ElizaOS inventory")
        .when(
            services.is_none()
                && insights.is_none()
                && (this.control_pending(SERVICES) || this.control_pending(INSIGHTS)),
            |panel| panel.child(empty(colors, "Loading runtime services…")),
        )
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
        );
    let wide = this.content_width(window, cx) >= px(850.);
    let secondary = div().min_w_0().child(recents).child(inventory);
    scroll("local-insights")
        .child(usage)
        .child(if wide {
            div().flex().child(chart.flex_1()).child(
                secondary
                    .w(gpui::relative(0.44))
                    .border_l_1()
                    .border_color(colors.divider),
            )
        } else {
            div().child(chart).child(secondary)
        })
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
