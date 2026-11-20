use serde_json::json;

use super::*;

pub(super) const JOBS: &str = "/cron/jobs";
pub(super) const RUNS: &str = "/cron/runs";
const REFRESH: &[&str] = &[JOBS, RUNS];

const FIELDS: &[(&str, &str, bool)] = &[
    ("automation-name", "Release readiness", false),
    ("automation-schedule", "0 9 * * 1-5 or every 2h", false),
    ("automation-prompt", "What should Doolittle do?", true),
    ("automation-url", "https://example.com/webhook", false),
    ("automation-condition-path", "payload.status", false),
    ("automation-condition-value", "ready", false),
];

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum AutomationTab {
    #[default]
    Jobs,
    Runs,
}

pub(super) struct AutomationState {
    tab: AutomationTab,
    builder_open: bool,
    editing: Option<String>,
    initial_definition: Option<Value>,
    submitted: Option<Value>,
    trigger: &'static str,
    action: &'static str,
    condition: &'static str,
    selected_run: Option<String>,
    mutation: Option<(String, &'static str)>,
    validation: Option<&'static str>,
}

impl Default for AutomationState {
    fn default() -> Self {
        Self {
            tab: AutomationTab::Jobs,
            builder_open: false,
            editing: None,
            initial_definition: None,
            submitted: None,
            trigger: "schedule",
            action: "prompt",
            condition: "always",
            selected_run: None,
            mutation: None,
            validation: None,
        }
    }
}

impl AutomationState {
    fn pending(&self, this: &Workbench) -> bool {
        self.mutation
            .as_ref()
            .is_some_and(|(path, _)| this.control_action_pending(path))
    }
}

pub(super) fn render(
    this: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    for &(name, placeholder, multiline) in FIELDS {
        this.operations
            .input(name, placeholder, multiline, window, cx);
    }
    let state = &this.operations.automation;
    let jobs = records(this, JOBS, "jobs");
    let runs = records(this, RUNS, "runs");
    let pending = state.pending(this);
    let list = match state.tab {
        AutomationTab::Jobs => div()
            .when(state.builder_open, |page| {
                page.child(builder(this, colors, pending, cx))
            })
            .children(load_state(
                this,
                JOBS,
                colors,
                "No automations yet. Create one to run a prompt or webhook.",
                !jobs.is_empty(),
            ))
            .children(jobs.iter().map(|job| job_row(job, pending, colors, cx))),
        AutomationTab::Runs => div()
            .children(load_state(
                this,
                RUNS,
                colors,
                "Runs will appear after an automation executes.",
                !runs.is_empty(),
            ))
            .children(
                runs.iter()
                    .map(|run| run_row(run, state.selected_run.as_deref(), colors, cx)),
            ),
    };
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            row(colors)
                .child(
                    group()
                        .justify_between()
                        .child(
                            group().children(
                                [
                                    (AutomationTab::Jobs, "Automations"),
                                    (AutomationTab::Runs, "Run history"),
                                ]
                                .into_iter()
                                .map(|(next, label)| {
                                    tab(("automation-tab", label), label, state.tab == next)
                                        .on_click(cx.listener(move |this, _, _, cx| {
                                            this.operations.automation.tab = next;
                                            this.control_get(
                                                if next == AutomationTab::Jobs {
                                                    JOBS
                                                } else {
                                                    RUNS
                                                },
                                                cx,
                                            );
                                            cx.notify();
                                        }))
                                }),
                            ),
                        )
                        .when(state.tab == AutomationTab::Jobs, |bar| {
                            bar.child(
                                button("new-automation")
                                    .small()
                                    .primary()
                                    .disabled(pending)
                                    .label(if state.builder_open {
                                        "Close form"
                                    } else {
                                        "New automation"
                                    })
                                    .on_click(cx.listener(|this, _, window, cx| {
                                        if this.operations.automation.builder_open {
                                            this.operations.automation.builder_open = false;
                                        } else {
                                            edit(this, None, window, cx);
                                        }
                                        cx.notify();
                                    })),
                            )
                        }),
                )
                .children(state.mutation.as_ref().map(|(path, caption)| {
                    div()
                        .children(action_error(this, path, colors))
                        .when(this.control_action_pending(path), |row| {
                            row.child(muted(colors, "Working…"))
                        })
                        .when_some(this.control_action_value(path), |row, receipt| {
                            let outcome = receipt.get("run").map(|run| value(run, "status"));
                            let message = match outcome {
                                Some("completed") => "Automation completed.",
                                Some("failed") => {
                                    "Automation failed. Open its run trace for details."
                                }
                                Some("skipped") => "Automation was skipped by its condition.",
                                _ => caption,
                            };
                            row.child(if outcome == Some("failed") {
                                error(colors, message)
                            } else {
                                muted(colors, message)
                            })
                        })
                })),
        )
        .child(
            scroll(match state.tab {
                AutomationTab::Jobs => "automation-jobs",
                AutomationTab::Runs => "automation-runs",
            })
            .child(list),
        )
        .into_any_element()
}

fn builder(this: &Workbench, colors: &Palette, pending: bool, cx: &mut Context<Workbench>) -> Div {
    let state = &this.operations.automation;
    let input = |name| &this.operations.inputs[name];
    row(colors)
        .bg(colors.inset)
        .child(heading(if state.editing.is_some() {
            "Edit automation"
        } else {
            "New automation"
        }))
        .child(field(input("automation-name"), "Name", colors))
        .child(muted(colors, "Trigger"))
        .child(
            group().children(
                [
                    ("schedule", "Schedule"),
                    ("manual", "Manual"),
                    ("webhook", "Webhook"),
                ]
                .into_iter()
                .map(|(key, label)| {
                    tab(("automation-trigger", key), label, key == state.trigger)
                        .disabled(pending)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.operations.automation.trigger = key;
                            cx.notify();
                        }))
                }),
            ),
        )
        .when(state.trigger == "schedule", |form| {
            form.child(field(input("automation-schedule"), "Schedule", colors))
        })
        .child(muted(colors, "Condition"))
        .child(
            group().children(
                [
                    ("always", "Always"),
                    ("exists", "Exists"),
                    ("equals", "Equals"),
                    ("contains", "Contains"),
                ]
                .into_iter()
                .map(|(key, label)| {
                    tab(("automation-condition", key), label, key == state.condition)
                        .disabled(pending)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.operations.automation.condition = key;
                            cx.notify();
                        }))
                }),
            ),
        )
        .when(state.condition != "always", |form| {
            form.child(field(
                input("automation-condition-path"),
                "Payload path",
                colors,
            ))
            .when(state.condition != "exists", |form| {
                form.child(field(
                    input("automation-condition-value"),
                    "Expected value",
                    colors,
                ))
            })
        })
        .child(muted(colors, "Action"))
        .child(
            group().children(
                [
                    ("prompt", "Prompt"),
                    ("run-agent", "Run agent"),
                    ("webhook", "POST webhook"),
                ]
                .into_iter()
                .map(|(key, label)| {
                    tab(("automation-action", key), label, key == state.action)
                        .disabled(pending)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.operations.automation.action = key;
                            cx.notify();
                        }))
                }),
            ),
        )
        .child(if state.action == "webhook" {
            field(input("automation-url"), "Destination URL", colors)
        } else {
            field(input("automation-prompt"), "Prompt", colors)
        })
        .children(state.validation.map(|message| error(colors, message)))
        .child(
            group().child(
                button("automation-save")
                    .small()
                    .primary()
                    .disabled(pending)
                    .label(if state.editing.is_some() {
                        "Save changes"
                    } else {
                        "Create automation"
                    })
                    .on_click(cx.listener(|this, _, window, cx| save(this, window, cx))),
            ),
        )
}

fn edit(
    this: &mut Workbench,
    job: Option<&Value>,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let mut replacement = AutomationState {
        builder_open: true,
        ..AutomationState::default()
    };
    if let Some(job) = job {
        replacement.editing = Some(value(job, "id").to_owned());
        replacement.initial_definition = Some(definition_from_record(job));
        replacement.trigger = match value(&job["trigger"], "type") {
            "manual" => "manual",
            "webhook" => "webhook",
            _ => "schedule",
        };
        replacement.action = match value(&job["action"], "type") {
            "run-agent" => "run-agent",
            "webhook" => "webhook",
            _ => "prompt",
        };
        replacement.condition = match value(&job["condition"], "operator") {
            "exists" => "exists",
            "equals" => "equals",
            "contains" => "contains",
            _ => "always",
        };
    }
    replacement.selected_run = this.operations.automation.selected_run.take();
    this.operations.automation = replacement;
    let blank = Value::Null;
    let job = job.unwrap_or(&blank);
    for (field, content) in [
        ("automation-name", value(job, "name")),
        (
            "automation-schedule",
            title(&job["trigger"], "schedule", value(job, "schedule")),
        ),
        (
            "automation-prompt",
            title(&job["action"], "prompt", value(job, "prompt")),
        ),
        ("automation-url", value(&job["action"], "url")),
        (
            "automation-condition-path",
            value(&job["condition"], "path"),
        ),
        (
            "automation-condition-value",
            value(&job["condition"], "value"),
        ),
    ] {
        this.operations
            .set_value(field, content.to_owned(), window, cx);
    }
    if let Some(input) = this.operations.inputs.get("automation-name") {
        input.update(cx, |state, cx| state.focus(window, cx));
    }
    cx.notify();
}

fn save(this: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let state = &this.operations.automation;
    if state.pending(this) {
        return;
    }
    let read = |key| this.operations.value(key, cx);
    let name = read("automation-name");
    let schedule = read("automation-schedule");
    let prompt = read("automation-prompt");
    let url = read("automation-url");
    let parsed_url = url::Url::parse(&url).ok().filter(|endpoint| {
        matches!(endpoint.scheme(), "http" | "https")
            && endpoint.host().is_some()
            && endpoint.username().is_empty()
            && endpoint.password().is_none()
            && endpoint.fragment().is_none()
    });
    let condition_path = read("automation-condition-path");
    let condition_value = read("automation-condition-value");
    let warning = if name.is_empty() {
        Some("Enter an automation name.")
    } else if state.trigger == "schedule" && schedule.is_empty() {
        Some("Enter a schedule.")
    } else if state.action == "webhook" && parsed_url.is_none() {
        Some("Enter an HTTP or HTTPS webhook URL without embedded credentials.")
    } else if state.action != "webhook" && prompt.is_empty() {
        Some("Enter the action prompt.")
    } else if state.condition != "always" && !valid_condition_path(&condition_path) {
        Some("Enter a dot-separated condition path, such as event.status.")
    } else if matches!(state.condition, "equals" | "contains") && condition_value.is_empty() {
        Some("Enter the expected condition value.")
    } else {
        None
    };
    if let Some(warning) = warning {
        this.operations.automation.validation = Some(warning);
        cx.notify();
        return;
    }
    let connector = state.action == "webhook";
    let normalized_url = parsed_url
        .as_ref()
        .map(url::Url::as_str)
        .unwrap_or_default();
    let trigger = if state.trigger == "schedule" {
        json!({"type": "schedule", "schedule": schedule})
    } else {
        json!({"type": state.trigger})
    };
    let action = if connector {
        json!({"type": "webhook", "url": normalized_url, "method": "POST"})
    } else {
        json!({"type": state.action, "prompt": prompt})
    };
    let condition = match state.condition {
        "always" => json!({"type":"always"}),
        "exists" => json!({"type":"payload", "path":condition_path, "operator":"exists"}),
        operator => {
            json!({"type":"payload", "path":condition_path, "operator":operator, "value":condition_value})
        }
    };
    let mut payload =
        json!({"name":name, "trigger":trigger, "action":action, "condition":condition});
    let (path, verb, label) = if let Some(id) = state.editing.as_deref().filter(|id| segment(id)) {
        if let Some(initial) = state.initial_definition.as_ref() {
            remove_unchanged(&mut payload, initial);
        }
        (
            format!("{JOBS}/{id}"),
            ControlMethod::Patch,
            "Automation updated.",
        )
    } else {
        payload["delivery"] = json!("local");
        payload["schedule"] = json!(if state.trigger == "schedule" {
            schedule.as_str()
        } else {
            state.trigger
        });
        payload["prompt"] = json!(if connector {
            format!("POST {normalized_url}")
        } else {
            prompt
        });
        (JOBS.to_owned(), ControlMethod::Post, "Automation created.")
    };
    if payload.as_object().is_some_and(serde_json::Map::is_empty) {
        this.operations.automation.validation = Some("There are no changes to save.");
        cx.notify();
        return;
    }
    if state.submitted.as_ref() == Some(&payload) && this.control_action_value(&path).is_some() {
        this.operations.automation.validation =
            Some("This automation definition has already been saved.");
        cx.notify();
        return;
    }
    this.operations.automation.validation = None;
    let asks_for_webhook = payload.get("action").is_some() && connector;
    let submit = move |this: &mut Workbench, cx: &mut Context<Workbench>| {
        this.operations.automation.submitted = Some(payload.clone());
        mutate(this, verb, path, Some(payload), label, cx);
    };
    if asks_for_webhook {
        let origin = parsed_url
            .as_ref()
            .map(|endpoint| endpoint.origin().ascii_serialization())
            .unwrap_or_default();
        confirm(
            this,
            "Save automation",
            "Allow scheduled webhook delivery?",
            &origin,
            window,
            cx,
            submit,
        );
    } else {
        submit(this, cx);
    }
}

fn valid_condition_path(path: &str) -> bool {
    !path.is_empty()
        && path.split('.').all(|part| {
            !part.is_empty()
                && part
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        })
}

fn definition_from_record(record: &Value) -> Value {
    let trigger = &record["trigger"];
    let trigger = match value(trigger, "type") {
        kind @ ("webhook" | "manual") => json!({"type": kind}),
        _ => {
            json!({"type": "schedule", "schedule": title(trigger, "schedule", value(record, "schedule"))})
        }
    };
    let condition = record
        .get("condition")
        .filter(|condition| condition.is_object())
        .cloned()
        .unwrap_or_else(|| json!({"type": "always"}));
    let action = record
        .get("action")
        .filter(|action| action.is_object())
        .cloned()
        .unwrap_or_else(|| json!({"type":"prompt", "prompt": value(record, "prompt")}));
    json!({"name": value(record, "name"), "trigger": trigger, "condition": condition, "action": action})
}

fn remove_unchanged(payload: &mut Value, previous: &Value) {
    if let Some(fields) = payload.as_object_mut() {
        fields.retain(|key, field| previous.get(key) != Some(field));
    }
}

fn mutate(
    this: &mut Workbench,
    method: ControlMethod,
    path: String,
    body: Option<Value>,
    label: &'static str,
    cx: &mut Context<Workbench>,
) {
    if this.operations.automation.pending(this) {
        return;
    }
    this.operations.automation.mutation = Some((path.clone(), label));
    this.control_send(method, &path, body, REFRESH, cx);
    cx.notify();
}

fn job_row(job: &Value, pending: bool, colors: &Palette, cx: &mut Context<Workbench>) -> Div {
    let id = value(job, "id");
    let name = title(job, "name", "Automation");
    let job_status = title(job, "status", "recorded");
    let trigger = title(&job["trigger"], "type", "schedule");
    let next = value(job, "nextRunAt");
    let content = row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(name.to_owned()))
                .child(status(colors, job_status)),
        )
        .child(muted(
            colors,
            format!(
                "{}{}{}",
                trigger,
                if next.is_empty() { "" } else { " · Next " },
                next
            ),
        ));
    if !segment(id) {
        return content;
    }
    let snapshot = job.clone();
    let label = name.to_owned();
    let delete = format!("{JOBS}/{id}");
    let trigger_path = format!("{JOBS}/{id}/trigger");
    let (transition, transition_label, result_label) = if job_status == "paused" {
        (
            format!("{JOBS}/{id}/resume"),
            "Resume",
            "Automation resumed.",
        )
    } else {
        (format!("{JOBS}/{id}/pause"), "Pause", "Automation paused.")
    };
    content.child(
        group()
            .child(
                button(format!("automation-{id}-run"))
                    .small()
                    .outline()
                    .disabled(pending)
                    .label("Run now")
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let path = trigger_path.clone();
                        confirm(
                            this,
                            "Run now",
                            "Run this automation?",
                            "Its saved action will execute immediately.",
                            window,
                            cx,
                            move |this, cx| {
                                mutate(
                                    this,
                                    ControlMethod::Post,
                                    path,
                                    Some(json!({})),
                                    "Trigger accepted. Check run history for the outcome.",
                                    cx,
                                )
                            },
                        );
                    })),
            )
            .child(
                button(format!("automation-{id}-transition"))
                    .small()
                    .ghost()
                    .disabled(pending)
                    .label(transition_label)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        mutate(
                            this,
                            ControlMethod::Post,
                            transition.clone(),
                            None,
                            result_label,
                            cx,
                        );
                    })),
            )
            .child(
                button(format!("automation-{id}-edit"))
                    .small()
                    .ghost()
                    .disabled(pending)
                    .label("Edit")
                    .on_click(cx.listener(move |this, _, window, cx| {
                        edit(this, Some(&snapshot), window, cx)
                    })),
            )
            .child(
                button(format!("automation-{id}-delete"))
                    .small()
                    .ghost()
                    .disabled(pending)
                    .label("Delete")
                    .on_click(cx.listener(move |this, _, window, cx| {
                        let path = delete.clone();
                        confirm(
                            this,
                            "Delete automation",
                            "Delete the scheduled job?",
                            &label,
                            window,
                            cx,
                            move |this, cx| {
                                mutate(
                                    this,
                                    ControlMethod::Delete,
                                    path,
                                    None,
                                    "Automation deleted.",
                                    cx,
                                )
                            },
                        );
                    })),
            ),
    )
}

fn run_row(
    run: &Value,
    selected: Option<&str>,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let id = value(run, "id");
    let open = selected == Some(id);
    let key = id.to_owned();
    row(colors)
        .child(
            group()
                .justify_between()
                .child(heading(title(run, "jobName", "Automation run").to_owned()))
                .child(status(colors, title(run, "status", "recorded"))),
        )
        .child(muted(colors, value(run, "createdAt").to_owned()))
        .when(segment(id), |row| {
            row.child(
                button(format!("automation-trace-{id}"))
                    .small()
                    .ghost()
                    .label(if open { "Hide trace" } else { "Open trace" })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let selected = &mut this.operations.automation.selected_run;
                        *selected =
                            (selected.as_deref() != Some(key.as_str())).then(|| key.clone());
                        cx.notify();
                    })),
            )
        })
        .when(open, |row| {
            row.when(!value(run, "output").is_empty(), |row| {
                row.child(value(run, "output").to_owned())
            })
            .children(run["trace"].as_array().into_iter().flatten().map(|step| {
                muted(
                    colors,
                    format!("{} · {}", value(step, "phase"), value(step, "message")),
                )
            }))
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editing_a_webhook_name_does_not_replace_its_trigger_token() {
        let previous = json!({"name":"Before", "trigger":{"type":"webhook", "token":"synthetic"}, "action":{"type":"prompt","prompt":"Read the event"}});
        let mut next = json!({"name":"After", "trigger":{"type":"webhook"}, "condition":{"type":"always"}, "action":{"type":"prompt","prompt":"Read the event"}});
        remove_unchanged(&mut next, &definition_from_record(&previous));
        assert_eq!(next, json!({"name":"After"}));
        assert!(valid_condition_path("event.ready_flag"));
        assert!(!valid_condition_path("event..flag"));
    }
}
