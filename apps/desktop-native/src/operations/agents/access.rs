use gpui::{PathPromptOptions, PromptButton, PromptLevel};

use super::*;

const MODEL: &str = "named-agent-model";
const PROVIDER: &str = "provider";
const PROJECTS: &str = "project-grants";

#[derive(Default)]
pub(super) struct AccessState {
    agent: Option<String>,
    selected: Option<Account>,
    pub(super) pending: bool,
    feedback: Option<(String, bool)>,
}

#[derive(Clone, PartialEq)]
struct Account {
    provider: String,
    id: String,
}

impl AccessState {
    pub(super) fn is_open(&self, id: &str) -> bool {
        self.agent.as_deref() == Some(id)
    }
}

fn route(id: &str, resource: &str) -> String {
    format!("{BOTS}/{id}/{resource}")
}

fn reload(this: &mut Workbench, id: &str, cx: &mut Context<Workbench>) {
    this.control_get(&route(id, PROVIDER), cx);
    this.control_get(&route(id, PROJECTS), cx);
}

pub(super) fn model_input(
    this: &mut Workbench,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Entity<InputState> {
    this.operations
        .input(MODEL, "Provider model ID", false, window, cx)
}

pub(super) fn toggle(
    this: &mut Workbench,
    id: &str,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let current = &this.operations.agents.access;
    if current.pending || !named_id(id) {
        return;
    }
    let opening = !current.is_open(id);
    this.operations.agents.access = AccessState {
        agent: opening.then(|| id.to_owned()),
        ..Default::default()
    };
    if opening {
        this.operations.set_value(MODEL, "", window, cx);
        reload(this, id, cx);
    }
    cx.notify();
}

pub(super) fn render(
    this: &Workbench,
    agent: &Value,
    model: &Entity<InputState>,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Div {
    let id = value(agent, "id");
    let state = &this.operations.agents.access;
    let busy = this.operations.agents.pending(this);
    let phase = value(agent, "state");
    let can_change = matches!(phase, "stopped" | "failed" | "error") && !busy;
    let provider_path = route(id, PROVIDER);
    let project_path = route(id, PROJECTS);
    let accounts = records(this, &provider_path, "accounts");
    let projects = records(this, &project_path, "projects");
    let mut choices = group().child(account_button(
        "Offline",
        Account {
            provider: "offline".to_owned(),
            id: String::new(),
        },
        agent,
        state.selected.as_ref(),
        can_change,
        cx,
    ));
    for entry in accounts {
        let provider = value(entry, "provider");
        let account_id = value(entry, "accountId");
        if let Some(provider_label) = provider_name(provider)
            && !account_id.is_empty()
        {
            choices = choices.child(account_button(
                format!("{provider_label} · {}", title(entry, "label", account_id)),
                Account {
                    provider: provider.to_owned(),
                    id: account_id.to_owned(),
                },
                agent,
                state.selected.as_ref(),
                can_change,
                cx,
            ));
        }
    }
    let current = agent.get("model").unwrap_or(&Value::Null);
    let active_model = title(current, "model", "offline");
    let active_provider = provider_name(value(current, "provider")).unwrap_or("Offline");
    let reload_id = id.to_owned();
    let choose_folder_for = id.to_owned();
    row(colors)
        .bg(colors.inset)
        .child(
            group()
                .justify_between()
                .child(heading("Agent access"))
                .child(
                    button(format!("reload-access-{id}"))
                        .small()
                        .ghost()
                        .label("Refresh access")
                        .disabled(busy)
                        .on_click(cx.listener(move |this, _, _, cx| reload(this, &reload_id, cx))),
                ),
        )
        .when(!can_change && !busy, |row| {
            row.child(muted(
                colors,
                "Stop the agent to change its model or project approvals.",
            ))
        })
        .children(state.feedback.as_ref().map(|(message, failed)| {
            if *failed {
                error(colors, message.clone())
            } else {
                muted(colors, message.clone())
            }
        }))
        .child(heading("Model account"))
        .child(muted(
            colors,
            format!("Current model · {active_provider} / {active_model}"),
        ))
        .child(choices)
        .children(load_state(
            this,
            &provider_path,
            colors,
            "Connect or check an account in Settings → Accounts, then refresh access.",
            !accounts.is_empty(),
        ))
        .when_some(state.selected.as_ref(), |row, selected| {
            let offline = selected.provider == "offline";
            row.when(!offline, |row| row.child(field(model, "Model ID", colors)))
                .child(
                    button("review-named-agent-model")
                        .small()
                        .outline()
                        .label("Review model change")
                        .disabled(!can_change)
                        .on_click(cx.listener(|this, _, window, cx| {
                            review_provider(this, window, cx);
                        })),
                )
        })
        .child(heading("Read-only projects"))
        .children(load_state(
            this,
            &project_path,
            colors,
            "No approved project folders.",
            !projects.is_empty(),
        ))
        .children(projects.iter().filter_map(|project| {
            let project_id = value(project, "id");
            if !segment(project_id) {
                return None;
            }
            let project_name = title(project, "name", "Project");
            let folder = value(project, "workspacePath");
            let available = project["available"].as_bool() == Some(true);
            let target = (
                id.to_owned(),
                title(agent, "name", "Agent").to_owned(),
                project_id.to_owned(),
            );
            let (revoke_agent, revoke_project) = (id.to_owned(), project_id.to_owned());
            Some(
                row(colors)
                    .child(heading(project_name.to_owned()))
                    .child(muted(colors, folder.to_owned()))
                    .when(!available, |row| {
                        row.child(muted(colors, "Folder unavailable"))
                    })
                    .child(
                        group()
                            .child(
                                button(format!("open-project-chat-{id}-{project_id}"))
                                    .small()
                                    .outline()
                                    .label("New project chat")
                                    .disabled(busy || phase != "ready" || !available)
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        open_project_chat(this, target.clone(), window, cx);
                                    })),
                            )
                            .child(
                                button(format!("revoke-agent-project-{id}-{project_id}"))
                                    .small()
                                    .ghost()
                                    .label("Revoke")
                                    .disabled(!can_change)
                                    .on_click(cx.listener(move |this, _, window, cx| {
                                        review(
                                            this,
                                            revoke_agent.clone(),
                                            Review::Revoke(revoke_project.clone()),
                                            window,
                                            cx,
                                        );
                                    })),
                            ),
                    ),
            )
        }))
        .child(
            button(format!("grant-agent-project-{id}"))
                .small()
                .outline()
                .label("Choose project folder…")
                .disabled(!can_change)
                .on_click(cx.listener(move |this, _, window, cx| {
                    review(this, choose_folder_for.clone(), Review::Folder, window, cx);
                })),
        )
}

fn provider_name(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some("OpenAI"),
        "anthropic" => Some("Anthropic"),
        "codex" => Some("Codex"),
        "offline" => Some("Offline"),
        _ => None,
    }
}

fn account_button(
    label: impl Into<gpui::SharedString>,
    account: Account,
    agent: &Value,
    selected: Option<&Account>,
    enabled: bool,
    cx: &mut Context<Workbench>,
) -> Button {
    let id = value(agent, "id");
    let current = agent.get("model").unwrap_or(&Value::Null);
    let model = if value(current, "provider") == account.provider {
        value(current, "model").to_owned()
    } else {
        String::new()
    };
    button(format!(
        "agent-model-{id}-{}-{}",
        account.provider, account.id
    ))
    .small()
    .outline()
    .selected(selected == Some(&account))
    .label(label)
    .disabled(!enabled)
    .on_click(cx.listener(move |this, _, window, cx| {
        this.operations.agents.access.selected = Some(account.clone());
        this.operations.set_value(MODEL, model.clone(), window, cx);
        cx.notify();
    }))
}

fn review_provider(this: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let access = &this.operations.agents.access;
    let (Some(id), Some(account)) = (access.agent.clone(), access.selected.as_ref()) else {
        return;
    };
    let body = if account.provider == "offline" {
        json!({"provider": "offline", "model": "offline"})
    } else {
        let model = this.operations.value(MODEL, cx);
        if model.is_empty() {
            finish(
                this,
                Some(("Enter the provider’s model ID.".into(), true)),
                cx,
            );
            return;
        }
        json!({"provider": account.provider, "model": model, "accountId": account.id})
    };
    review(this, id, Review::Provider(body), window, cx);
}

enum Review {
    Provider(Value),
    Folder,
    Revoke(String),
}

impl Review {
    fn labels(
        &self,
    ) -> (
        &'static str,
        &'static str,
        &'static str,
        &'static str,
        &'static str,
    ) {
        match self {
            Self::Provider(_) => (
                PROVIDER,
                "preview",
                "Change model access?",
                "Change model",
                "Model updated.",
            ),
            Self::Folder => (
                PROJECTS,
                "preview",
                "Approve project access?",
                "Allow read-only access",
                "Project access approved.",
            ),
            Self::Revoke(_) => (
                PROJECTS,
                "revoke",
                "Revoke project access?",
                "Revoke access",
                "Project access revoked.",
            ),
        }
    }
}

fn begin(
    this: &mut Workbench,
    id: &str,
    cx: &mut Context<Workbench>,
) -> Option<doolittle_runtime::RuntimeClient> {
    if !this.operations.agents.access.is_open(id) || this.operations.agents.pending(this) {
        return None;
    }
    let client = this.runtime_client()?;
    this.operations.agents.access.pending = true;
    this.operations.agents.access.feedback = Some(("Updating agent access…".into(), false));
    cx.notify();
    Some(client)
}

fn finish(this: &mut Workbench, feedback: Option<(String, bool)>, cx: &mut Context<Workbench>) {
    this.operations.agents.access.pending = false;
    this.operations.agents.access.feedback = feedback;
    cx.notify();
}

fn review(
    this: &mut Workbench,
    id: String,
    action: Review,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let Some(client) = begin(this, &id, cx) else {
        return;
    };
    let folder = matches!(action, Review::Folder).then(|| {
        cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Choose an agent project folder".into()),
        })
    });
    let executor = cx.background_executor().clone();
    let (resource, step, title, label, success) = action.labels();
    cx.spawn_in(window, async move |this, cx| {
        let body = match action {
            Review::Provider(body) => body,
            Review::Revoke(project) => json!({"projectId": project}),
            Review::Folder => match folder.expect("folder chooser").await {
                Ok(Ok(Some(paths))) if paths.len() == 1 => {
                    let Some(folder) = paths[0].to_str() else {
                        let _ = this.update(cx, |this, cx| {
                            finish(
                                this,
                                Some(("Choose a folder with a UTF-8 path.".into(), true)),
                                cx,
                            )
                        });
                        return;
                    };
                    json!({"folder": folder})
                }
                Ok(Ok(_)) => {
                    let _ = this.update(cx, |this, cx| finish(this, None, cx));
                    return;
                }
                _ => {
                    let _ = this.update(cx, |this, cx| {
                        finish(
                            this,
                            Some(("The folder chooser was unavailable.".into(), true)),
                            cx,
                        )
                    });
                    return;
                }
            },
        };
        let preview_path = route(&id, &format!("{resource}/{step}"));
        let review_client = client.clone();
        let preview =
            executor
                .spawn(async move {
                    review_client.control(ControlMethod::Post, &preview_path, Some(&body))
                })
                .await;
        let (preview_id, detail) = match preview {
            Ok(preview)
                if named_id(value(&preview, "previewId"))
                    && !value(&preview, "detail").is_empty() =>
            {
                (
                    value(&preview, "previewId").to_owned(),
                    value(&preview, "detail").to_owned(),
                )
            }
            result => {
                let message = result
                    .err()
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "The agent returned an invalid access preview.".into());
                let _ = this.update(cx, |this, cx| finish(this, Some((message, true)), cx));
                return;
            }
        };
        let Ok(answer) = this.update_in(cx, |_, window, cx| {
            window.prompt(
                PromptLevel::Warning,
                title,
                Some(&detail),
                &[PromptButton::ok("Cancel"), PromptButton::new(label)],
                cx,
            )
        }) else {
            return;
        };
        if answer.await != Ok(1) {
            let _ = this.update(cx, |this, cx| finish(this, None, cx));
            return;
        }
        let confirm_path = route(&id, &format!("{resource}/confirm"));
        let applied = executor
            .spawn(async move {
                client.control(
                    ControlMethod::Post,
                    &confirm_path,
                    Some(&json!({"previewId": preview_id})),
                )
            })
            .await;
        let _ = this.update(cx, |this, cx| match applied {
            Ok(value) if value["ok"] == true => {
                this.operations.agents.access.selected = None;
                this.control_get(BOTS, cx);
                reload(this, &id, cx);
                finish(this, Some((success.into(), false)), cx);
            }
            result => {
                let message = result
                    .err()
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "The agent did not confirm the access change.".into());
                finish(this, Some((message, true)), cx);
            }
        });
    })
    .detach();
}

fn open_project_chat(
    this: &mut Workbench,
    (id, name, project): (String, String, String),
    window: &mut Window,
    cx: &mut Context<Workbench>,
) {
    let Some(client) = begin(this, &id, cx) else {
        return;
    };
    let path = route(&id, "project-chats");
    let executor = cx.background_executor().clone();
    cx.spawn_in(window, async move |this, cx| {
        let result = executor
            .spawn(async move {
                client.control(
                    ControlMethod::Post,
                    &path,
                    Some(&json!({"projectId": project})),
                )
            })
            .await;
        let _ = this.update_in(cx, |this, window, cx| match result {
            Ok(result) if named_id(value(&result, "sessionId")) => {
                finish(this, None, cx);
                this.open_named_agent_session(
                    id,
                    name,
                    value(&result, "sessionId").to_owned(),
                    window,
                    cx,
                );
            }
            other => {
                let message = other
                    .err()
                    .map(|error| error.to_string())
                    .unwrap_or_else(|| "The agent returned an invalid conversation ID.".into());
                finish(this, Some((message, true)), cx);
            }
        });
    })
    .detach();
}
