use std::time::Duration;

use doolittle_runtime::ControlMethod;
use gpui::{Context, Div, SharedString, Window, prelude::*};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
};
use serde_json::{Value, json};

use super::{
    ACCOUNT_POOLS, ConnectionsPage, PROVIDER_ACCOUNTS, RUNTIME, SETTINGS, accounts::LinkedProvider,
    field, input_field, muted, notice, panel, row, text_at, value,
};
use crate::{ui::Palette, workbench::Workbench};

const START: &str = "/accounts/oauth/start";
const SUBMIT: &str = "/accounts/oauth/code";
const CANCEL: &str = "/accounts/oauth/cancel";

pub(super) fn sign_in(
    workbench: &Workbench,
    provider: LinkedProvider,
    connected: bool,
    busy: bool,
    cx: &mut Context<Workbench>,
) -> Button {
    let available = workbench.ready()
        && !busy
        && !workbench.control_action_pending(START)
        && active_flow(workbench)
            .is_none_or(|flow| text_at(Some(flow), "status") != Some("pending"));
    let button = Button::new(SharedString::from(format!("oauth-start-{}", provider.id())))
        .small()
        .label(if connected {
            "Link another account"
        } else {
            "Sign in"
        })
        .disabled(!available)
        .on_click(cx.listener(move |this, _, _, cx| start(this, provider, cx)));
    if connected {
        button.ghost()
    } else {
        button.primary()
    }
}

fn start(workbench: &mut Workbench, provider: LinkedProvider, cx: &mut Context<Workbench>) {
    let Some(provider_id) = provider.oauth_id() else {
        return;
    };
    workbench.connections.fields.remove("provider-oauth-code");
    workbench.connections.linked_provider = None;
    workbench
        .connections
        .feedback
        .remove(&ConnectionsPage::Accounts);
    workbench.connections.oauth_provider = Some(provider);
    workbench.connections.oauth_browser_requested = false;
    workbench.connections.oauth_generation = workbench.connections.oauth_generation.wrapping_add(1);
    let generation = workbench.connections.oauth_generation;
    workbench.control_send(
        ControlMethod::Post,
        START,
        Some(json!({"provider":provider_id})),
        &[],
        cx,
    );

    cx.spawn(async move |this, cx| {
        // Poll status independently of navigation so a browser callback updates
        // the directory even if the user opens another settings page.
        for _ in 0..150 {
            cx.background_executor().timer(Duration::from_secs(2)).await;
            let Ok(keep_polling) = this.update(cx, |this, cx| {
                if generation != this.connections.oauth_generation || !this.ready() {
                    return false;
                }
                let Some(flow) = active_flow(this) else {
                    return this.control_action_pending(START);
                };
                match text_at(Some(flow), "status") {
                    Some("pending") => {
                        let path = flow_id(flow).map(status_path);
                        if !this.connections.oauth_browser_requested
                            && let Some(url) = start_flow(this)
                                .and_then(|flow| text_at(Some(flow), "authUrl"))
                                .filter(|url| trusted_oauth_url(provider, url))
                                .map(str::to_owned)
                        {
                            this.connections.oauth_browser_requested = true;
                            cx.open_url(&url);
                        }
                        if let Some(path) = path {
                            this.control_get(&path, cx);
                        }
                        true
                    }
                    Some("success") => {
                        for path in [ACCOUNT_POOLS, PROVIDER_ACCOUNTS, SETTINGS, RUNTIME] {
                            this.control_get(path, cx);
                        }
                        this.connections.fields.remove("provider-oauth-code");
                        false
                    }
                    _ => {
                        this.connections.fields.remove("provider-oauth-code");
                        false
                    }
                }
            }) else {
                break;
            };
            if !keep_polling {
                break;
            }
        }
    })
    .detach();
}

pub(super) fn panel_content(
    workbench: &mut Workbench,
    colors: &Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> Option<Div> {
    let provider = workbench.connections.oauth_provider?;
    let mut content = panel(colors, "Provider sign-in").child(muted(colors, provider.name()));
    if let Some(error) = workbench.control_action_error(START) {
        return Some(content.child(notice(colors, error.to_owned(), true)));
    }
    let Some(flow) = active_flow(workbench).cloned() else {
        return Some(content.child(muted(colors, "Preparing sign-in…")));
    };
    let id = flow_id(&flow)?.to_owned();
    let status = text_at(Some(&flow), "status").unwrap_or("unknown");
    match status {
        "success" => {
            return Some(content.child(notice(
                colors,
                "Signed in. This account is in your local ElizaOS vault.",
                false,
            )));
        }
        "cancelled" => return Some(content.child(notice(colors, "Sign-in cancelled.", false))),
        "error" | "timeout" => {
            return Some(
                content.child(notice(
                    colors,
                    text_at(Some(&flow), "message")
                        .unwrap_or("Sign-in did not finish. You can start again.")
                        .to_owned(),
                    true,
                )),
            );
        }
        "pending" => {}
        _ => return Some(content.child(notice(colors, "Sign-in status is unavailable.", true))),
    }
    // The SDK's start response owns the initial browser URL. Status responses
    // may omit it and never get to redirect the native client.
    let launch = start_flow(workbench)
        .and_then(|flow| text_at(Some(flow), "authUrl"))
        .filter(|url| trusted_oauth_url(provider, url))
        .map(str::to_owned);
    let status_route = status_path(&id);
    let receiving =
        workbench.control_action_pending(SUBMIT) || workbench.control_action_pending(CANCEL);
    let code_submitted = flow.get("codeSubmitted").and_then(Value::as_bool) == Some(true);
    let awaiting_code =
        !code_submitted && flow.get("needsCodeSubmission").and_then(Value::as_bool) == Some(true);
    let input = awaiting_code.then(|| {
        input_field(
            workbench,
            "provider-oauth-code",
            "",
            "Callback URL or code",
            true,
            window,
            cx,
        )
    });
    content = content
        .child(muted(colors,if code_submitted {"Callback received. Finishing sign-in…"} else {"Continue on the provider’s sign-in page. This window checks for completion automatically."}))
        .when_some(launch, |section,url| section.child(Button::new("oauth-open-browser").small().ghost().label("Open sign-in page")
            .on_click(cx.listener(move |this, _, _, cx| {
                this.connections.oauth_browser_requested = true;
                cx.open_url(&url);
            }))))
        .when_some(workbench.control_error(&status_route), |section,error| section.child(notice(colors,error.to_owned(),true)))
        .when_some(workbench.control_action_error(SUBMIT), |section,error| section.child(notice(colors,error.to_owned(),true)))
        .when_some(workbench.control_action_error(CANCEL), |section,error| section.child(notice(colors,error.to_owned(),true)));
    if let Some(input) = input {
        let flow = id.clone();
        content = content
            .child(field("Callback URL or code", &input, colors, !receiving))
            .child(
                Button::new("oauth-use-manual-code")
                    .small()
                    .label("Submit callback")
                    .disabled(receiving)
                    .on_click(cx.listener(move |this, _, _, cx| {
                        let code = value(this, "provider-oauth-code", cx);
                        let code = code.trim();
                        if code.is_empty() || code.len() > 8192 || code.contains(['\r', '\n', '\0'])
                        {
                            this.connections.set_feedback(
                                ConnectionsPage::Accounts,
                                "Enter the code or callback URL from the provider.",
                            );
                            cx.notify();
                            return;
                        }
                        this.connections.fields.remove("provider-oauth-code");
                        this.connections.feedback.remove(&ConnectionsPage::Accounts);
                        this.control_send(
                            ControlMethod::Post,
                            SUBMIT,
                            Some(json!({"flowId":flow,"code":code})),
                            &[],
                            cx,
                        );
                    })),
            );
    }
    Some(
        content.child(
            row()
                .child(
                    Button::new("oauth-refresh")
                        .small()
                        .ghost()
                        .label("Check status")
                        .disabled(workbench.control_pending(&status_route))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.control_get(&status_route, cx)),
                        ),
                )
                .child(
                    Button::new("oauth-cancel")
                        .small()
                        .ghost()
                        .label("Cancel sign-in")
                        .disabled(receiving)
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.connections.fields.remove("provider-oauth-code");
                            this.control_send(
                                ControlMethod::Post,
                                CANCEL,
                                Some(json!({"flowId":id})),
                                &[],
                                cx,
                            );
                        })),
                ),
        ),
    )
}

fn start_flow(workbench: &Workbench) -> Option<&Value> {
    let provider = workbench.connections.oauth_provider?.oauth_id()?;
    let flow = workbench.control_action_value(START)?.get("flow")?;
    (text_at(Some(flow), "provider") == Some(provider)).then_some(flow)
}

fn active_flow(workbench: &Workbench) -> Option<&Value> {
    let start = start_flow(workbench)?;
    let id = flow_id(start)?;
    let status = workbench
        .control_value(&status_path(id))
        .and_then(|reply| reply.get("flow"));
    let submit = workbench
        .control_action_value(SUBMIT)
        .and_then(|reply| reply.get("flow"));
    let cancel = workbench
        .control_action_value(CANCEL)
        .and_then(|reply| reply.get("flow"));
    [cancel, submit, status]
        .into_iter()
        .flatten()
        .find(|flow| flow_id(flow) == Some(id) && text_at(Some(flow), "status") != Some("pending"))
        .or_else(|| {
            submit.filter(|flow| {
                flow_id(flow) == Some(id)
                    && flow.get("codeSubmitted").and_then(Value::as_bool) == Some(true)
            })
        })
        .or_else(|| status.filter(|flow| flow_id(flow) == Some(id)))
        .or(Some(start))
}

fn flow_id(flow: &Value) -> Option<&str> {
    let id = text_at(Some(flow), "id")?;
    let valid = id.len() <= 128
        && id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte));
    valid.then_some(id)
}

fn status_path(id: &str) -> String {
    format!("/accounts/oauth/status?flowId={id}")
}

fn trusted_oauth_url(provider: LinkedProvider, url: &str) -> bool {
    let prefix = match provider {
        LinkedProvider::Codex => "https://auth.openai.com/oauth/authorize?",
        LinkedProvider::Claude => "https://claude.ai/oauth/authorize?",
        LinkedProvider::ElizaCloud => return false,
    };
    url.strip_prefix(prefix).is_some_and(|query| {
        !query.is_empty()
            && query.len() < 8192
            && query
                .bytes()
                .all(|byte| byte.is_ascii_graphic() && byte != b'#')
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn browser_sign_in_only_opens_the_sdk_provider_route() {
        let url = "https://auth.openai.com/oauth/authorize?state=sample&scope=openid";
        assert!(trusted_oauth_url(LinkedProvider::Codex, url));
        assert!(!trusted_oauth_url(LinkedProvider::Claude, url));
        assert!(!trusted_oauth_url(
            LinkedProvider::Codex,
            "https://auth.openai.com.evil.test/oauth/authorize?state=sample"
        ));
        assert!(!trusted_oauth_url(
            LinkedProvider::Claude,
            "https://claude.ai/oauth/authorize?state=sample#fragment"
        ));
    }
}
