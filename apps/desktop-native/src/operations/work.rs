use serde_json::json;

use super::*;

pub(super) const OVERVIEW: &str = "/delegation/overview-snapshot";
pub(super) const TASKS: &str = "/delegation/tasks";
pub(super) const APPROVALS: &str = "/execution/approvals";
pub(super) const CHAT_RUNS: &str = "/chat/runs";
pub(super) const IDENTITY: &str = "/runtime/bot-identity";
pub(super) const WORKERS: &str = "/delegation/workers";
const CODEGEN_RUNS: &str = "/codegen/runs";
const WORKFLOWS: &str = "/codegen/workflows";
const PLANS: &str = "/plans";

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum WorkTab {
    #[default]
    Queue,
    Runs,
    Plans,
}

impl WorkTab {
    fn routes(self) -> &'static [&'static str] {
        match self {
            Self::Queue => &[OVERVIEW, TASKS],
            Self::Runs => &[CHAT_RUNS, CODEGEN_RUNS, WORKFLOWS],
            Self::Plans => &[PLANS],
        }
    }
}

#[derive(Default)]
pub(super) struct WorkState {
    tab: WorkTab,
    builder: bool,
    selected_task: Option<String>,
    approval_pending_only: bool,
    action: Option<(String, &'static str)>,
    approval_action: Option<(String, &'static str)>,
    validation: Option<&'static str>,
}

pub(super) fn refresh(this: &mut Workbench, cx: &mut Context<Workbench>) {
    for &path in this.operations.work.tab.routes() {
        this.control_get(path, cx);
    }
    if let Some(id) = this
        .operations
        .work
        .selected_task
        .as_deref()
        .filter(|id| segment(id))
    {
        this.control_get(&format!("{TASKS}/{id}"), cx);
    }
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let active = this.operations.work.tab;
    let inner = match active {
        WorkTab::Queue => queue(this, colors, window, cx),
        WorkTab::Runs => runs(this, colors),
        WorkTab::Plans => plans(this, colors, window, cx),
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
                            (WorkTab::Queue, "Queue"),
                            (WorkTab::Runs, "Runs"),
                            (WorkTab::Plans, "Plans"),
                        ]
                        .into_iter()
                        .map(|(next, label)| {
                            tab(("work-section", label), label, active == next).on_click(
                                cx.listener(move |this, _, _, cx| {
                                    this.operations.work.tab = next;
                                    this.operations.work.builder = false;
                                    this.operations.work.validation = None;
                                    refresh(this, cx);
                                    cx.notify();
                                }),
                            )
                        }),
                    ),
                )
                .children(show_outcome(
                    this,
                    this.operations.work.action.as_ref(),
                    colors,
                )),
        )
        .child(scroll("work-operations-content").child(inner))
        .into_any_element()
}

fn queue(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let state = &this.operations.work;
    let selected_id = state.selected_task.clone();
    let summary = this
        .control_value(OVERVIEW)
        .and_then(|data| data.get("overview"));
    let counts = summary.and_then(|summary| {
        let totals = summary.get("total")?.as_u64()?;
        Some(format!(
            "{totals} tasks · {} pending · {} running",
            summary["pending"].as_u64().unwrap_or(0),
            summary["running"].as_u64().unwrap_or(0)
        ))
    });
    let builder = state.builder;
    let form = builder.then(|| objective_form(this, "task", colors, window, cx));
    let tasks = records(this, TASKS, "tasks");
    let list = panel(colors, "Task queue")
        .children(load_state(
            this,
            TASKS,
            colors,
            "No delegated tasks yet.",
            !tasks.is_empty(),
        ))
        .children(
            tasks
                .iter()
                .map(|task| task_row(this, task, selected_id.as_deref(), colors, cx)),
        );
    div()
        .child(
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(heading("Delegated work"))
                        .child(builder_button("new-task", "New task", builder, cx)),
                )
                .children(counts.map(|counts| muted(colors, counts)))
                .children(
                    this.control_error(OVERVIEW)
                        .map(|message| error(colors, message.to_owned())),
                ),
        )
        .children(form)
        .child(list)
}

fn builder_button(
    id: &'static str,
    label: &'static str,
    open: bool,
    cx: &mut Context<Workbench>,
) -> Button {
    button(id)
        .small()
        .outline()
        .label(if open { "Close form" } else { label })
        .on_click(cx.listener(|this, _, _, cx| {
            this.operations.work.builder = !this.operations.work.builder;
            this.operations.work.validation = None;
            cx.notify();
        }))
}

fn objective_form(
    this: &mut Workbench,
    kind: &'static str,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let (name_key, objective_key, is_task) = if kind == "task" {
        ("task-title", "task-objective", true)
    } else {
        ("plan-title", "plan-objective", false)
    };
    let name = this
        .operations
        .input(name_key, "Give this work a name", false, window, cx);
    let objective = this.operations.input(
        objective_key,
        "Describe the desired outcome",
        true,
        window,
        cx,
    );
    let steps = (!is_task).then(|| {
        this.operations
            .input("plan-steps", "Add one step per line", true, window, cx)
    });
    let (path, label, receipt, refresh) = if is_task {
        (
            TASKS,
            "Create task",
            "Task added to the queue.",
            &[TASKS, OVERVIEW] as &[&str],
        )
    } else {
        (
            "/plans/create",
            "Create plan",
            "Draft plan created.",
            &[PLANS] as &[&str],
        )
    };
    row(colors)
        .bg(colors.inset)
        .child(heading(if is_task { "New task" } else { "Draft a plan" }))
        .child(field(&name, "Title", colors))
        .child(field(&objective, "Objective", colors))
        .children(steps.as_ref().map(|entity| field(entity, "Steps", colors)))
        .children(
            this.operations
                .work
                .validation
                .map(|notice| error(colors, notice)),
        )
        .child(
            group().child(
                button(format!("create-objective-{kind}"))
                    .small()
                    .primary()
                    .label(label)
                    .disabled(action_pending(this, this.operations.work.action.as_ref()))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let name = this.operations.value(name_key, cx);
                        let objective = this.operations.value(objective_key, cx);
                        if name.is_empty() || objective.is_empty() {
                            this.operations.work.validation = Some("Enter a title and objective.");
                            cx.notify();
                            return;
                        }
                        let mut payload = json!({"title":name, "objective":objective});
                        if !is_task {
                            let text = this.operations.value("plan-steps", cx);
                            let steps: Vec<_> = text
                                .lines()
                                .map(str::trim)
                                .filter(|step| !step.is_empty())
                                .collect();
                            if !steps.is_empty() {
                                payload["steps"] = json!(steps);
                            }
                        }
                        this.operations.work.validation = None;
                        operate(this, path.to_owned(), payload, receipt, refresh, cx);
                    })),
            ),
        )
}

fn task_row(
    this: &Workbench,
    task: &Value,
    selected: Option<&str>,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let id = value(task, "id");
    let state = title(task, "status", "pending");
    let name = title(task, "title", "Delegated task");
    let open = selected == Some(id);
    let detail_path = format!("{TASKS}/{id}");
    let detail = this
        .control_value(&detail_path)
        .and_then(|root| root.get("task"))
        .filter(|value| value.is_object())
        .unwrap_or(task);
    let key = id.to_owned();
    let disabled = action_pending(this, this.operations.work.action.as_ref());
    row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(name.to_owned()))
                .child(status(colors, state)),
        )
        .child(muted(
            colors,
            format!(
                "{} · {}",
                title(task, "group", "workspace"),
                title(task, "priority", "normal")
            ),
        ))
        .when(segment(id), |row| {
            row.child(
                button(format!("work-task-{id}"))
                    .small()
                    .ghost()
                    .label(if open { "Hide details" } else { "Open task" })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let selected = &mut this.operations.work.selected_task;
                        if selected.as_deref() == Some(key.as_str()) {
                            *selected = None;
                        } else {
                            *selected = Some(key.clone());
                            this.control_get(&detail_path, cx);
                        }
                        cx.notify();
                    })),
            )
        })
        .when(open, |row| {
            row.when(!value(detail, "objective").is_empty(), |row| {
                row.child(value(detail, "objective").to_owned())
            })
            .children(
                detail["notes"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .take(5)
                    .filter_map(|note| note.as_str().map(|text| muted(colors, text.to_owned()))),
            )
            .child(
                group().children(task_controls(state).iter().map(
                    |&(operation, label, feedback)| {
                        let endpoint = format!("{TASKS}/{id}/{operation}");
                        let detail_route = format!("{TASKS}/{id}");
                        let description = name.to_owned();
                        button(endpoint.clone())
                            .small()
                            .outline()
                            .label(label)
                            .disabled(disabled)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let path = endpoint.clone();
                                let detail_route = detail_route.clone();
                                if operation == "cancel" {
                                    confirm(
                                        label,
                                        if operation == "cancel" {
                                            "Cancel delegated task?"
                                        } else {
                                            "Start delegated task?"
                                        },
                                        &description,
                                        window,
                                        cx,
                                        move |this, cx| {
                                            operate(
                                                this,
                                                path,
                                                json!({}),
                                                feedback,
                                                &[TASKS, OVERVIEW, &detail_route],
                                                cx,
                                            )
                                        },
                                    );
                                } else {
                                    operate(
                                        this,
                                        path,
                                        json!({}),
                                        feedback,
                                        &[TASKS, OVERVIEW, &detail_route],
                                        cx,
                                    );
                                }
                            }))
                    },
                )),
            )
        })
}

fn task_controls(state: &str) -> &'static [(&'static str, &'static str, &'static str)] {
    match state {
        "pending" | "queued" => &[("cancel", "Cancel", "Task cancelled.")],
        "running" | "in_progress" => &[("cancel", "Cancel", "Task cancelled.")],
        "failed" | "cancelled" => &[("retry", "Requeue", "Task requeued.")],
        _ => &[],
    }
}

fn plans(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Div {
    let builder = this.operations.work.builder;
    let form = builder.then(|| objective_form(this, "plan", colors, window, cx));
    let entries = records(this, PLANS, "plans");
    let busy = action_pending(this, this.operations.work.action.as_ref());
    div()
        .child(
            row(colors).child(
                group()
                    .justify_between()
                    .child(heading("Execution plans"))
                    .child(builder_button("new-plan", "New plan", builder, cx)),
            ),
        )
        .children(form)
        .child(
            panel(colors, "Plans")
                .children(load_state(
                    this,
                    PLANS,
                    colors,
                    "No plans yet.",
                    !entries.is_empty(),
                ))
                .children(entries.iter().map(|plan| {
                    let id = value(plan, "id");
                    let name = title(plan, "title", "Plan");
                    let plan_status = title(plan, "status", "draft");
                    let path = format!("{PLANS}/{id}/approve");
                    let description = name.to_owned();
                    row(colors)
                        .child(
                            group()
                                .justify_between()
                                .child(heading(name.to_owned()))
                                .child(status(colors, plan_status)),
                        )
                        .when(!value(plan, "objective").is_empty(), |row| {
                            row.child(value(plan, "objective").to_owned())
                        })
                        .children(
                            plan["steps"]
                                .as_array()
                                .into_iter()
                                .flatten()
                                .take(20)
                                .enumerate()
                                .map(|(step, value)| {
                                    let label = value
                                        .as_str()
                                        .unwrap_or_else(|| title(value, "title", "Step"));
                                    muted(colors, format!("{}. {label}", step + 1))
                                }),
                        )
                        .when(plan_status == "draft" && segment(id), |row| {
                            row.child(
                                group().child(
                                    button(path.clone())
                                        .small()
                                        .outline()
                                        .label("Approve plan")
                                        .disabled(busy)
                                        .on_click(cx.listener(move |_, _, window, cx| {
                                            let path = path.clone();
                                            confirm(
                                                "Approve plan",
                                                "Approve this execution plan?",
                                                &description,
                                                window,
                                                cx,
                                                move |this, cx| {
                                                    operate(
                                                        this,
                                                        path,
                                                        json!({}),
                                                        "Plan approved.",
                                                        &[PLANS],
                                                        cx,
                                                    )
                                                },
                                            );
                                        })),
                                ),
                            )
                        })
                })),
        )
}

fn runs(this: &Workbench, colors: &Palette) -> Div {
    div()
        .child(run_list(
            this,
            CHAT_RUNS,
            "runs",
            "Chat runs",
            "No chat runs yet.",
            colors,
        ))
        .child(run_list(
            this,
            CODEGEN_RUNS,
            "runs",
            "Coding runs",
            "No coding runs yet.",
            colors,
        ))
        .child(run_list(
            this,
            WORKFLOWS,
            "workflows",
            "Workflows",
            "No coding workflows yet.",
            colors,
        ))
}

fn run_list(
    this: &Workbench,
    path: &str,
    key: &str,
    title_text: &'static str,
    empty_text: &'static str,
    colors: &Palette,
) -> Div {
    let entries = records(this, path, key);
    panel(colors, title_text)
        .children(load_state(
            this,
            path,
            colors,
            empty_text,
            !entries.is_empty(),
        ))
        .children(entries.iter().map(|run| {
            let fallback = title(run, "message", title(run, "kind", "Run"));
            let started = title(run, "startedAt", value(run, "createdAt"));
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(heading(title(run, "title", fallback).to_owned()))
                        .child(status(colors, title(run, "status", "recorded"))),
                )
                .child(muted(colors, started.to_owned()))
                .when(!value(run, "summary").is_empty(), |row| {
                    row.child(value(run, "summary").to_owned())
                })
        }))
}

pub(super) fn agents(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let named = super::agents::render(this, colors, window, cx);
    let entries = records(this, WORKERS, "workers");
    let lead = this.control_value(IDENTITY);
    scroll("agents-operations-list")
        .child(
            panel(colors, "Workspace lead")
                .when_some(lead, |panel, record| {
                    panel.child(
                        row(colors)
                            .child(
                                group()
                                    .justify_between()
                                    .child(heading(title(record, "name", "Doolittle").to_owned()))
                                    .child(status(colors, "online")),
                            )
                            .child(
                                group().child(
                                    button("open-lead-chat")
                                        .small()
                                        .outline()
                                        .label("Open lead chat")
                                        .on_click(cx.listener(|this, _, window, cx| {
                                            this.set_view(crate::workbench::View::Agent, window, cx)
                                        })),
                                ),
                            ),
                    )
                })
                .children(load_state(
                    this,
                    IDENTITY,
                    colors,
                    "No runtime identity available.",
                    lead.is_some(),
                )),
        )
        .child(named)
        .child(
            panel(colors, "Delegated workers")
                .children(load_state(
                    this,
                    WORKERS,
                    colors,
                    "No delegated workers.",
                    !entries.is_empty(),
                ))
                .children(entries.iter().map(|entry| {
                    row(colors)
                        .child(
                            group()
                                .justify_between()
                                .child(heading(
                                    title(entry, "title", "Delegated worker").to_owned(),
                                ))
                                .child(status(colors, title(entry, "status", "recorded"))),
                        )
                        .child(muted(
                            colors,
                            format!(
                                "{} · {}",
                                title(entry, "profile", "worker"),
                                title(entry, "group", "workspace")
                            ),
                        ))
                })),
        )
        .into_any_element()
}

pub(super) fn review(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let changes = super::review::render(this, colors, window, cx);
    let entries = records(this, APPROVALS, "approvals");
    let pending = this.operations.work.approval_pending_only;
    let visible: Vec<_> = entries
        .iter()
        .filter(|approval| !pending || value(approval, "status") == "pending")
        .collect();
    let review_action = this.operations.work.approval_action.as_ref();
    let busy = action_pending(this, review_action);
    scroll("review-operations-list")
        .child(
            row(colors)
                .child(
                    group().children(
                        [(false, "All requests"), (true, "Pending")]
                            .into_iter()
                            .map(|(filter, label)| {
                                tab(("approval-filter", label), label, pending == filter).on_click(
                                    cx.listener(move |this, _, _, cx| {
                                        this.operations.work.approval_pending_only = filter;
                                        cx.notify();
                                    }),
                                )
                            }),
                    ),
                )
                .children(show_outcome(this, review_action, colors)),
        )
        .child(
            panel(colors, "Execution approvals")
                .children(load_state(
                    this,
                    APPROVALS,
                    colors,
                    if pending {
                        "No pending approval requests."
                    } else {
                        "No execution approvals yet."
                    },
                    !visible.is_empty(),
                ))
                .children(
                    visible
                        .into_iter()
                        .map(|approval| approval_row(approval, busy, colors, cx)),
                ),
        )
        .child(changes)
        .child(run_list(
            this,
            CHAT_RUNS,
            "runs",
            "Recent chat runs",
            "No chat runs yet.",
            colors,
        ))
        .into_any_element()
}

fn approval_row(
    approval: &Value,
    busy: bool,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let id = value(approval, "id");
    let state = title(approval, "status", "recorded");
    let command = title(approval, "command", "Execution request");
    row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(command.to_owned()))
                .child(status(colors, state)),
        )
        .when(!value(approval, "reason").is_empty(), |row| {
            row.child(value(approval, "reason").to_owned())
        })
        .when(!value(approval, "expiresAt").is_empty(), |row| {
            row.child(muted(
                colors,
                format!("Expires {}", value(approval, "expiresAt")),
            ))
        })
        .when(state == "pending" && segment(id), |row| {
            row.child(
                group().children(
                    [
                        ("approve", "Approve", "Execution approved."),
                        ("deny", "Deny", "Execution denied."),
                    ]
                    .into_iter()
                    .map(|(action, label, feedback)| {
                        let path = format!("{APPROVALS}/{id}/{action}");
                        let description = command.to_owned();
                        button(path.clone())
                            .small()
                            .outline()
                            .label(label)
                            .disabled(busy)
                            .on_click(cx.listener(move |this, _, window, cx| {
                                let path = path.clone();
                                if action_pending(
                                    this,
                                    this.operations.work.approval_action.as_ref(),
                                ) {
                                    return;
                                }
                                confirm(
                                    label,
                                    if action == "approve" {
                                        "Approve this execution?"
                                    } else {
                                        "Deny this execution?"
                                    },
                                    &description,
                                    window,
                                    cx,
                                    move |this, cx| {
                                        if action_pending(
                                            this,
                                            this.operations.work.approval_action.as_ref(),
                                        ) {
                                            return;
                                        }
                                        this.operations.work.approval_action =
                                            Some((path.clone(), feedback));
                                        send(this, &path, None, &[APPROVALS], cx);
                                        cx.notify();
                                    },
                                );
                            }))
                    }),
                ),
            )
        })
}

fn action_pending(this: &Workbench, action: Option<&(String, &'static str)>) -> bool {
    action.is_some_and(|(path, _)| this.control_action_pending(path))
}

fn show_outcome(
    this: &Workbench,
    action: Option<&(String, &'static str)>,
    colors: &Palette,
) -> Option<AnyElement> {
    action.and_then(|(path, label)| {
        action_error(this, path, colors).or_else(|| {
            if this.control_action_pending(path) {
                Some(muted(colors, "Updating…").into_any_element())
            } else {
                this.control_action_value(path)
                    .map(|_| muted(colors, *label).into_any_element())
            }
        })
    })
}

fn operate(
    this: &mut Workbench,
    path: String,
    body: Value,
    feedback: &'static str,
    refresh: &[&str],
    cx: &mut Context<Workbench>,
) {
    if action_pending(this, this.operations.work.action.as_ref()) {
        return;
    }
    this.operations.work.action = Some((path.clone(), feedback));
    send(this, &path, Some(body), refresh, cx);
    cx.notify();
}
