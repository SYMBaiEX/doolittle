use doolittle_runtime::ControlMethod;
use gpui::{
    AnyElement, ClipboardItem, Context, FontWeight, PromptButton, PromptLevel, Window, div,
    prelude::*, px,
};
use gpui_component::{
    Disableable, Selectable, Sizable,
    button::{Button, ButtonVariants},
};
use serde_json::{Value, json};

use super::{
    ACCOUNT_POOLS, ConnectionsPage, PROVIDER_ACCOUNTS, RUNTIME, SETTINGS, action_status, column,
    field, flag, input_field, muted, notice, panel, read_status, request_action, row, text_at,
    value, values,
};
use crate::{ui::Palette, workbench::Workbench};

const ACCOUNT_REFRESH: &[&str] = &[PROVIDER_ACCOUNTS, ACCOUNT_POOLS, SETTINGS, RUNTIME];
const POOL_REFRESH: &[&str] = &[ACCOUNT_POOLS, PROVIDER_ACCOUNTS, RUNTIME];
const POOLS: [(&str, &str); 4] = [
    ("openai-codex", "Codex subscriptions"),
    ("anthropic-subscription", "Claude subscriptions"),
    ("openai-api", "OpenAI API"),
    ("anthropic-api", "Anthropic API"),
];
const STRATEGIES: [(&str, &str); 4] = [
    ("priority", "Priority"),
    ("round-robin", "Round robin"),
    ("least-used", "Least used"),
    ("quota-aware", "Quota aware"),
];

pub(super) fn provider_name(id: &str) -> &str {
    match id {
        "codex" | "openai-codex" => "Codex",
        "claude-code" | "anthropic-subscription" => "Claude Code",
        "elizacloud" | "eliza-cloud" => "Eliza Cloud",
        "openai" | "openai-api" => "OpenAI",
        "anthropic" | "anthropic-api" => "Anthropic",
        "ollama" => "Ollama",
        "offline" => "Offline",
        _ => id,
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) enum LinkedProvider {
    Codex,
    Claude,
    ElizaCloud,
}

impl LinkedProvider {
    const ALL: [Self; 3] = [Self::Codex, Self::Claude, Self::ElizaCloud];

    pub(super) const fn id(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude-code",
            Self::ElizaCloud => "elizacloud",
        }
    }
    pub(super) const fn oauth_id(self) -> Option<&'static str> {
        match self {
            Self::Codex | Self::Claude => Some(self.id()),
            Self::ElizaCloud => None,
        }
    }

    const fn key(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claudeCode",
            Self::ElizaCloud => "elizaCloud",
        }
    }
    pub(super) const fn name(self) -> &'static str {
        match self {
            Self::Codex => "Codex",
            Self::Claude => "Claude Code",
            Self::ElizaCloud => "Eliza Cloud",
        }
    }
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
pub(super) enum DirectProvider {
    #[default]
    OpenAi,
    Anthropic,
}

impl DirectProvider {
    const ALL: [Self; 2] = [Self::OpenAi, Self::Anthropic];
    const fn name(self) -> &'static str {
        match self {
            Self::OpenAi => "OpenAI",
            Self::Anthropic => "Anthropic",
        }
    }
    const fn route(self) -> &'static str {
        match self {
            Self::OpenAi => "/runtime/account-pool/openai-api/credentials",
            Self::Anthropic => "/runtime/account-pool/anthropic-api/credentials",
        }
    }
    const fn api_provider(self) -> &'static str {
        match self {
            Self::OpenAi => "openai-api",
            Self::Anthropic => "anthropic-api",
        }
    }
}

pub(super) fn render(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let snapshot = workbench.control_value(PROVIDER_ACCOUNTS);
    let active = text_at(snapshot, "activeProvider");
    let ready = workbench.ready();
    let busy = [
        "/accounts/refresh",
        "/accounts/connect",
        "/accounts/use",
        "/accounts/login",
    ]
    .iter()
    .any(|path| workbench.control_action_pending(path));
    let provider_rows = LinkedProvider::ALL
        .into_iter()
        .map(|provider| {
            let status = snapshot
                .and_then(|data| data.get("accounts"))
                .and_then(|accounts| accounts.get(provider.key()));
            let route_available = ["nativeReady", "fallbackReady", "reusable"]
                .iter()
                .any(|key| flag(status, key));
            let readiness = if route_available {
                "Connected"
            } else if status.is_none()
                || status
                    .and_then(|status| status.get("checked"))
                    .and_then(Value::as_bool)
                    == Some(false)
            {
                "Not checked"
            } else {
                "Needs sign-in"
            };
            let selected = active.is_some_and(|id| provider_name(id) == provider.name());
            let command = || json!({"provider":provider.id()});
            column(7.)
                .py(px(8.))
                .border_t_1()
                .border_color(colors.divider)
                .child(
                    row()
                        .justify_between()
                        .child(div().font_weight(FontWeight::MEDIUM).child(provider.name()))
                        .child(
                            div()
                                .text_sm()
                                .text_color(if route_available {
                                    colors.positive
                                } else {
                                    colors.muted
                                })
                                .child(if selected && route_available {
                                    "Connected · Default"
                                } else {
                                    readiness
                                }),
                        ),
                )
                .child(
                    row()
                        .when(route_available && !selected, |actions| {
                            actions.child(
                                request_action(
                                    format!("activate-{}", provider.id()),
                                    "Use for new chats",
                                    ready && !busy,
                                    (ControlMethod::Post, "/accounts/use"),
                                    Some(command()),
                                    ACCOUNT_REFRESH,
                                    cx,
                                )
                                .primary(),
                            )
                        })
                        .when(provider.oauth_id().is_some(), |actions| {
                            actions.child(super::oauth::sign_in(
                                workbench,
                                provider,
                                route_available,
                                busy,
                                cx,
                            ))
                        })
                        .when(!route_available, |actions| {
                            actions.child(
                                request_action(
                                    format!("connect-{}", provider.id()),
                                    "Use saved sign-in",
                                    ready && !busy,
                                    (ControlMethod::Post, "/accounts/connect"),
                                    Some(command()),
                                    ACCOUNT_REFRESH,
                                    cx,
                                )
                                .ghost(),
                            )
                        })
                        .child(
                            Button::new(gpui::SharedString::from(format!(
                                "login-{}",
                                provider.id()
                            )))
                            .small()
                            .ghost()
                            .label(if provider.oauth_id().is_some() {
                                "Other sign-in options"
                            } else {
                                "How to sign in"
                            })
                            .disabled(!ready || busy)
                            .on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.connections.linked_provider = Some(provider);
                                    this.control_send(
                                        ControlMethod::Post,
                                        "/accounts/login",
                                        Some(json!({"provider":provider.id()})),
                                        &[],
                                        cx,
                                    );
                                },
                            )),
                        ),
                )
        })
        .collect::<Vec<_>>();

    let mut roster = panel(colors, "Provider connections")
        .child(
            row()
                .justify_between()
                .child(muted(
                    colors,
                    format!(
                        "Current default: {}",
                        active.map(provider_name).unwrap_or("Not selected")
                    ),
                ))
                .child(request_action(
                    "check-saved-accounts",
                    "Check saved accounts",
                    ready && !busy,
                    (ControlMethod::Post, "/accounts/refresh"),
                    Some(json!({"provider":"all"})),
                    ACCOUNT_REFRESH,
                    cx,
                )),
        )
        .children(provider_rows)
        .when_some(
            read_status(workbench, PROVIDER_ACCOUNTS, colors),
            |surface, status| surface.child(status),
        )
        .when_some(
            action_status(
                workbench,
                "/accounts/refresh",
                "Saved account checks finished.",
                colors,
            ),
            |surface, status| surface.child(status),
        )
        .when_some(
            action_status(
                workbench,
                "/accounts/use",
                "Provider preference updated.",
                colors,
            ),
            |surface, status| surface.child(status),
        );
    if let Some(message) = workbench.control_action_error("/accounts/connect") {
        roster = roster.child(notice(colors, message.to_owned(), true));
    } else if let Some(data) = workbench.control_action_value("/accounts/connect") {
        let fallback = if flag(Some(data), "connected") {
            "Saved account is connected."
        } else {
            "No reusable sign-in was found."
        };
        roster = roster.child(notice(
            colors,
            text_at(Some(data), "detail").unwrap_or(fallback).to_owned(),
            !flag(Some(data), "connected"),
        ));
    }
    let auth = super::oauth::panel_content(workbench, colors, window, cx);
    let account_edit = edit_account_panel(workbench, colors, window, cx);
    column(0.)
        .when_some(auth, |body, panel| body.child(panel))
        .when_some(
            sign_in_instructions(workbench, colors, cx),
            |body, instructions| body.child(instructions),
        )
        .child(roster)
        .child(
            panel(colors, "API keys")
                .child(muted(
                    colors,
                    "Connect directly to OpenAI or Anthropic with an API key.",
                ))
                .child(row().child(super::settings::route_button(
                    "accounts-open-credentials",
                    "Add an API key",
                    ConnectionsPage::Credentials,
                    cx,
                ))),
        )
        .when_some(account_edit, |body, editor| body.child(editor))
        .child(pool_directory(workbench, colors, cx))
        .into_any_element()
}

fn sign_in_instructions(
    workbench: &Workbench,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> Option<AnyElement> {
    let provider = workbench.connections.linked_provider?;
    let result = workbench.control_action_value("/accounts/login");
    let result = result.filter(|data| text_at(Some(data), "provider") == Some(provider.id()));
    let command = text_at(result, "command");
    let setup = text_at(result, "setupCommand");
    let mut instructions = panel(colors, "Sign in to your provider")
        .child(muted(
            colors,
            format!(
                "{} · run the provider’s official sign-in, then check saved accounts.",
                provider.name()
            ),
        ))
        .when_some(
            workbench.control_action_error("/accounts/login"),
            |section, error| section.child(notice(colors, error.to_owned(), true)),
        )
        .when(
            workbench.control_action_pending("/accounts/login"),
            |section| section.child(muted(colors, "Loading sign-in instructions…")),
        );
    if let Some(command) = command {
        instructions = instructions.child(copy_command("login-command", command, colors, cx));
    }
    if let Some(setup) = setup.filter(|setup| Some(*setup) != command) {
        instructions = instructions.child(copy_command("setup-command", setup, colors, cx));
    }
    Some(instructions.into_any_element())
}

fn copy_command(
    id: &'static str,
    command: &str,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> gpui::Div {
    let command = command.to_owned();
    row()
        .justify_between()
        .child(muted(colors, command.clone()))
        .child(
            Button::new(id)
                .small()
                .ghost()
                .label("Copy command")
                .on_click(cx.listener(move |_, _, _, cx| {
                    cx.write_to_clipboard(ClipboardItem::new_string(command.clone()));
                })),
        )
}

fn pool_directory(
    workbench: &Workbench,
    colors: &Palette,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let response = workbench.control_value(ACCOUNT_POOLS);
    let inventory = text_at(response, "inventory").unwrap_or("unchecked");
    let ready = workbench.ready() && inventory == "ready";
    let heading = match inventory {
        "ready" => "Account inventory ready",
        "unavailable" => "Credential storage unavailable",
        _ => "Use Check saved accounts to load the vault inventory",
    };
    panel(colors, "Account routing and rotation")
        .child(muted(colors, heading))
        .when_some(
            read_status(workbench, ACCOUNT_POOLS, colors),
            |section, status| section.child(status),
        )
        .children(POOLS.into_iter().filter_map(|(id, title)| {
            let pool =
                response.and_then(|response| response.pointer(&format!("/providers/{id}")))?;
            Some(pool_section(workbench, colors, id, title, pool, ready, cx))
        }))
        .into_any_element()
}

fn pool_section(
    workbench: &Workbench,
    colors: &Palette,
    provider: &'static str,
    title: &'static str,
    pool: &Value,
    ready: bool,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let strategy = text_at(Some(pool), "strategy").unwrap_or("priority");
    let strategy_path = format!("/runtime/account-pool/{provider}/strategy");
    let select_path = format!("/runtime/account-pool/{provider}/select");
    let accounts = values(Some(pool), "accounts");
    column(8.)
        .border_t_1()
        .border_color(colors.divider)
        .py(px(8.))
        .child(
            row()
                .justify_between()
                .child(div().child(title))
                .child(muted(colors, format!("{} saved", accounts.len()))),
        )
        .child(row().children(STRATEGIES.into_iter().map(|(id, label)| {
            request_action(
                format!("{provider}-{id}"),
                label,
                ready && strategy != id && !workbench.control_action_pending(&strategy_path),
                (ControlMethod::Post, strategy_path.clone()),
                Some(json!({"strategy":id})),
                POOL_REFRESH,
                cx,
            )
        })))
        .child(row().child(request_action(
            format!("{provider}-select"),
            "Select next account",
            ready && !accounts.is_empty() && !workbench.control_action_pending(&select_path),
            (ControlMethod::Post, select_path.clone()),
            Some(json!({})),
            POOL_REFRESH,
            cx,
        )))
        .when_some(
            workbench
                .control_action_value(&select_path)
                .and_then(|result| text_at(result.get("account"), "label")),
            |section, label| section.child(muted(colors, format!("Selected · {label}"))),
        )
        .when_some(
            action_status(workbench, &strategy_path, "Routing strategy saved.", colors),
            |section, status| section.child(status),
        )
        .children(
            accounts.iter().filter_map(|account| {
                pool_account(workbench, colors, provider, account, ready, cx)
            }),
        )
        .into_any_element()
}

fn pool_account(
    workbench: &Workbench,
    colors: &Palette,
    provider: &'static str,
    account: &Value,
    ready: bool,
    cx: &mut Context<Workbench>,
) -> Option<AnyElement> {
    let id = text_at(Some(account), "accountId")?;
    if !valid_account_id(id) {
        return None;
    }
    let label = text_at(Some(account), "label").unwrap_or(id);
    let enabled = flag(Some(account), "enabled");
    let health = text_at(Some(account), "health").unwrap_or("Unchecked");
    let path = format!("/runtime/account-pool/{provider}/{id}");
    let test_path = format!("{path}/test");
    let usage_path = format!("{path}/refresh-usage");
    let loading = [&path, &test_path, &usage_path]
        .into_iter()
        .any(|route| workbench.control_action_pending(route));
    let can_edit = ready && !loading;
    let priority = account
        .get("priority")
        .and_then(Value::as_i64)
        .unwrap_or_default();
    let subtitle = format!(
        "{health} · {} · Priority {priority}",
        if enabled { "Enabled" } else { "Disabled" }
    );
    let edit_id = id.to_owned();
    let test = workbench.control_action_value(&test_path);
    let mut item = column(4.)
        .p(px(8.))
        .rounded(px(5.))
        .border_1()
        .border_color(colors.divider)
        .child(
            row()
                .justify_between()
                .child(div().child(label.to_owned()))
                .child(muted(colors, subtitle)),
        )
        .child(
            row()
                .child(
                    Button::new(gpui::SharedString::from(format!("{provider}-{id}-edit")))
                        .small()
                        .ghost()
                        .label("Edit")
                        .disabled(!can_edit)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.connections.fields.remove("account-edit-label");
                            this.connections.fields.remove("account-edit-priority");
                            this.connections.account_edit =
                                Some((provider.to_owned(), edit_id.clone()));
                            this.connections.feedback.remove(&ConnectionsPage::Accounts);
                            cx.notify();
                        })),
                )
                .child(request_action(
                    format!("{provider}-{id}-toggle"),
                    if enabled { "Disable" } else { "Enable" },
                    can_edit,
                    (ControlMethod::Patch, path.clone()),
                    Some(json!({"enabled":!enabled})),
                    POOL_REFRESH,
                    cx,
                ))
                .child(request_action(
                    format!("{provider}-{id}-test"),
                    "Check credentials",
                    can_edit,
                    (ControlMethod::Post, test_path.clone()),
                    Some(json!({})),
                    POOL_REFRESH,
                    cx,
                ))
                .when(!provider.ends_with("-api"), |actions| {
                    actions.child(request_action(
                        format!("{provider}-{id}-usage"),
                        "Refresh usage",
                        can_edit,
                        (ControlMethod::Post, usage_path.clone()),
                        Some(json!({})),
                        POOL_REFRESH,
                        cx,
                    ))
                })
                .child(remove_account_button(
                    format!("{provider}-{id}-delete"),
                    label.to_owned(),
                    path.clone(),
                    can_edit,
                    cx,
                )),
        )
        .when_some(
            action_status(workbench, &path, "Account updated.", colors),
            |item, status| item.child(status),
        )
        .when_some(
            action_status(workbench, &usage_path, "Usage check finished.", colors),
            |item, status| item.child(status),
        );
    if let Some(error) = workbench.control_action_error(&test_path) {
        item = item.child(notice(colors, error.to_owned(), true));
    } else if let Some(test) = test {
        let ok = flag(Some(test), "ok");
        item = item.child(notice(
            colors,
            if ok {
                "Credential check passed."
            } else {
                "Credential check failed."
            },
            !ok,
        ));
    }
    Some(item.into_any_element())
}

fn edit_account_panel(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Option<gpui::Div> {
    let (provider, id) = workbench.connections.account_edit.clone()?;
    let accounts = values(
        workbench
            .control_value(ACCOUNT_POOLS)
            .and_then(|data| data.pointer(&format!("/providers/{provider}"))),
        "accounts",
    );
    let account = accounts
        .iter()
        .find(|account| text_at(Some(account), "accountId") == Some(id.as_str()));
    let close = Button::new("account-edit-close")
        .small()
        .ghost()
        .label("Close")
        .on_click(cx.listener(|this, _, _, cx| {
            this.connections.account_edit = None;
            this.connections.feedback.remove(&ConnectionsPage::Accounts);
            cx.notify();
        }));
    let Some(account) = account else {
        return Some(
            panel(colors, "Edit account")
                .child(notice(colors, "The account is no longer available.", true))
                .child(close),
        );
    };
    let label = text_at(Some(account), "label").unwrap_or(&id).to_owned();
    let priority = account
        .get("priority")
        .and_then(Value::as_i64)
        .unwrap_or_default()
        .to_string();
    let path = format!("/runtime/account-pool/{provider}/{id}");
    let ready = workbench.ready() && !workbench.control_action_pending(&path);
    let label = input_field(
        workbench,
        "account-edit-label",
        &label,
        "Account label",
        false,
        window,
        cx,
    );
    let priority = input_field(
        workbench,
        "account-edit-priority",
        &priority,
        "Account priority",
        false,
        window,
        cx,
    );
    let save_path = path.clone();
    Some(panel(colors,"Edit account")
        .child(muted(colors,format!("{provider} · {id}")))
        .child(field("Display name",&label,colors,ready))
        .child(field("Routing priority",&priority,colors,ready))
        .when_some(action_status(workbench,&path,"Account saved.",colors),|section,state| section.child(state))
        .child(row().child(Button::new("account-edit-save").small().label("Save account").disabled(!ready)
            .on_click(cx.listener(move |this,_,_,cx| {
                let label=value(this,"account-edit-label",cx);
                let priority=value(this,"account-edit-priority",cx);
                let label=label.trim();
                let priority=priority.trim().parse::<u16>().ok();
                if let Some(priority) = priority.filter(|_| !label.is_empty() && label.encode_utf16().count()<=120 && !label.chars().any(char::is_control)) {
                    this.connections.feedback.remove(&ConnectionsPage::Accounts);
                    this.control_send(ControlMethod::Patch,&save_path,Some(json!({"label":label,"priority":priority})),POOL_REFRESH,cx);
                } else {
                    this.connections.set_feedback(ConnectionsPage::Accounts,"Enter a display name and a nonnegative whole-number priority.");
                    cx.notify();
                }
            }))).child(close)))
}

fn remove_account_button(
    id: String,
    label: String,
    path: String,
    enabled: bool,
    cx: &mut Context<Workbench>,
) -> Button {
    Button::new(gpui::SharedString::from(id))
        .ghost()
        .small()
        .label("Remove")
        .disabled(!enabled)
        .on_click(cx.listener(move |_, _, window, cx| {
            let confirmation = window.prompt(
                PromptLevel::Warning,
                "Remove this provider account?",
                Some(&label),
                &[
                    PromptButton::ok("Keep account"),
                    PromptButton::new("Remove account"),
                ],
                cx,
            );
            let path = path.clone();
            cx.spawn_in(window, async move |this, cx| {
                if confirmation.await == Ok(1) {
                    let _ = this.update_in(cx, |this, _, cx| {
                        this.control_send(ControlMethod::Delete, &path, None, POOL_REFRESH, cx);
                    });
                }
            })
            .detach();
        }))
}

pub(super) fn credentials(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let label = input_field(
        workbench,
        "provider-account-label",
        "",
        "Work or personal",
        false,
        window,
        cx,
    );
    let account_id = workbench.connections.credential_options_open.then(|| {
        input_field(
            workbench,
            "provider-account-id",
            "",
            "Optional stable account ID",
            false,
            window,
            cx,
        )
    });
    let key = input_field(
        workbench,
        "provider-api-key",
        "",
        "API key",
        true,
        window,
        cx,
    );
    let provider = workbench.connections.credential_provider;
    let busy = DirectProvider::ALL
        .into_iter()
        .any(|provider| workbench.control_action_pending(provider.route()));
    let ready = workbench.ready() && !busy;
    let complete = !key.read(cx).value().trim().is_empty();
    let directory = workbench.control_value(ACCOUNT_POOLS);
    let saved = workbench.control_action_value(provider.route());
    let saved_applied = saved
        .and_then(|result| result.get("applied"))
        .and_then(Value::as_bool)
        != Some(false);
    let count = values(
        directory.and_then(|data| data.pointer(&format!("/providers/{}", provider.api_provider()))),
        "accounts",
    )
    .len();
    panel(colors, "Add an API credential")
        .child(muted(
            colors,
            format!(
                "{} · {count} saved {}",
                provider.name(),
                if count == 1 { "account" } else { "accounts" }
            ),
        ))
        .child(
            row().children(DirectProvider::ALL.into_iter().map(|choice| {
                let button = Button::new(gpui::SharedString::from(format!(
                    "key-provider-{}",
                    choice.api_provider()
                )))
                .small()
                .label(choice.name())
                .ghost()
                .selected(choice == provider)
                .disabled(busy);
                button.on_click(cx.listener(move |this, _, _, cx| {
                    if choice != this.connections.credential_provider {
                        this.connections.clear_sensitive_drafts();
                        this.connections.credential_options_open = false;
                        this.connections.fields.remove("provider-account-id");
                        this.connections
                            .feedback
                            .remove(&ConnectionsPage::Credentials);
                        this.connections.credential_provider = choice;
                        cx.notify();
                    }
                }))
            })),
        )
        .child(field("API key", &key, colors, ready).max_w(px(580.)))
        .child(field("Display name (optional)", &label, colors, ready).max_w(px(580.)))
        .child(
            row().child(
                Button::new("credential-id-options")
                    .small()
                    .ghost()
                    .label(if account_id.is_some() {
                        "Hide account ID"
                    } else {
                        "Set a custom account ID…"
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.connections.credential_options_open =
                            !this.connections.credential_options_open;
                        cx.notify();
                    })),
            ),
        )
        .when_some(account_id, |section, id| {
            section.child(field("Account ID", &id, colors, ready).max_w(px(580.)))
        })
        .when_some(
            action_status(
                workbench,
                provider.route(),
                if saved_applied {
                    "API credential stored in ElizaOS."
                } else {
                    "API credential stored. The current model connection did not refresh."
                },
                colors,
            ),
            |section, status| section.child(status),
        )
        .child(
            row()
                .child(
                    Button::new("store-provider-key")
                        .small()
                        .primary()
                        .label(if busy { "Saving…" } else { "Save API key" })
                        .disabled(!ready || !complete)
                        .on_click(cx.listener(|this, _, _, cx| save_credential(this, cx))),
                )
                .when(saved.is_some(), |actions| {
                    actions.child(super::settings::route_button(
                        "credentials-open-models",
                        "Choose a model",
                        ConnectionsPage::Models,
                        cx,
                    ))
                }),
        )
        .into_any_element()
}

fn save_credential(workbench: &mut Workbench, cx: &mut Context<Workbench>) {
    let label = value(workbench, "provider-account-label", cx);
    let id = if workbench.connections.credential_options_open {
        value(workbench, "provider-account-id", cx)
    } else {
        String::new()
    };
    let api_key = value(workbench, "provider-api-key", cx);
    let suggested_label = format!(
        "{} API key",
        workbench.connections.credential_provider.name()
    );
    let label = if label.trim().is_empty() {
        suggested_label.as_str()
    } else {
        label.trim()
    };
    let id = id.trim();
    let id = if id.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        id.to_owned()
    };
    let api_key = api_key.trim();
    if label.encode_utf16().count() > 120
        || label.chars().any(char::is_control)
        || !valid_account_id(&id)
        || id.len() > 120
        || api_key.is_empty()
        || api_key.len() > 8192
        || !api_key.bytes().all(|byte| byte.is_ascii_graphic())
    {
        workbench.connections.set_feedback(
            ConnectionsPage::Credentials,
            "Check the API key and any custom display name or account ID.",
        );
        cx.notify();
        return;
    }
    workbench.connections.clear_sensitive_drafts();
    workbench
        .connections
        .feedback
        .remove(&ConnectionsPage::Credentials);
    let route = workbench.connections.credential_provider.route();
    workbench.control_send(
        ControlMethod::Post,
        route,
        Some(json!({"accountId":id,"label":label,"apiKey":api_key})),
        POOL_REFRESH,
        cx,
    );
}

fn valid_account_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id.as_bytes()[0].is_ascii_alphanumeric()
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.".contains(&byte))
        && id != "."
        && id != ".."
}

#[cfg(test)]
mod tests {
    use super::valid_account_id;

    #[test]
    fn account_actions_require_one_safe_url_segment() {
        assert!(valid_account_id("work-01"));
        assert!(!valid_account_id("work/main"));
        assert!(!valid_account_id("work%2Fmain"));
        assert!(!valid_account_id(".."));
    }
}
