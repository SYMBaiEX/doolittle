use std::borrow::Cow;
use std::io::IsTerminal as _;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail, ensure};
use clap::{Subcommand, ValueEnum};
use doolittle_runtime::{ControlMethod, RuntimeClient};
use rustyline::{
    Behavior, ColorMode, Config, Editor, Helper,
    completion::Completer,
    highlight::{CmdKind, Highlighter},
    hint::Hinter,
    history::MemHistory,
    validate::Validator,
};
use serde_json::{Value, json};

use crate::{operator, turn};

#[derive(Clone, Copy, ValueEnum)]
pub(crate) enum Provider {
    Codex,
    ClaudeCode,
    Elizacloud,
}

#[derive(Clone, Copy, ValueEnum)]
pub(crate) enum ApiProvider {
    OpenaiApi,
    AnthropicApi,
}

impl ApiProvider {
    fn as_str(self) -> &'static str {
        match self {
            Self::OpenaiApi => "openai-api",
            Self::AnthropicApi => "anthropic-api",
        }
    }
}

impl Provider {
    fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::ClaudeCode => "claude-code",
            Self::Elizacloud => "elizacloud",
        }
    }
}

#[derive(Subcommand)]
pub(crate) enum AccountCommand {
    /// Browse linked model accounts
    List,
    /// Check account and host integration readiness
    Doctor,
    /// Refresh saved local account state
    Refresh { provider: Option<Provider> },
    /// Activate a saved connected account
    Use { provider: Provider },
    /// Import an existing provider login from the local system
    Import { provider: Provider },
    /// Start provider sign-in and wait for it to finish
    Connect {
        provider: Provider,
        #[arg(long)]
        label: Option<String>,
        /// Paste a loopback callback URL for Codex when its browser cannot reach it
        #[arg(long)]
        manual: bool,
    },
    /// Add an API key to the ElizaOS credential store using masked input
    AddKey {
        provider: ApiProvider,
        #[arg(long)]
        id: String,
        #[arg(long)]
        label: String,
    },
}

impl AccountCommand {
    pub(crate) fn execute(self, client: &RuntimeClient, as_json: bool) -> Result<()> {
        self.execute_with_signals(client, as_json, None)
    }

    pub(crate) fn execute_with_signals(
        self,
        client: &RuntimeClient,
        as_json: bool,
        signals: Option<&AtomicUsize>,
    ) -> Result<()> {
        let result = match self {
            Self::List => client.get_json("/runtime/accounts", None)?,
            Self::Doctor => client.get_json("/accounts/doctor", None)?,
            Self::Refresh { provider } => {
                account_action(client, "refresh", provider.map_or("all", Provider::as_str))?
            }
            Self::Use { provider } => account_action(client, "use", provider.as_str())?,
            Self::Import { provider } => account_action(client, "connect", provider.as_str())?,
            Self::Connect {
                provider: Provider::Elizacloud,
                ..
            } => account_action(client, "connect", "elizacloud")?,
            Self::Connect {
                provider,
                label,
                manual,
            } => return oauth(client, provider, label, manual, as_json, signals),
            Self::AddKey {
                provider,
                id,
                label,
            } => {
                let key = hidden_input("Provider API key › ")?;
                let payload = client
                    .control(
                        ControlMethod::Post,
                        &format!("/runtime/account-pool/{}/credentials", provider.as_str()),
                        Some(&json!({"accountId": id, "label": label, "apiKey": key})),
                    )
                    .map_err(|_| {
                        anyhow::anyhow!("The provider credential could not be confirmed")
                    })?;
                let account = payload
                    .get("account")
                    .context("Provider returned no account metadata")?;
                json!({"provider": provider.as_str(), "id": account.get("id"), "label": account.get("label"), "applied": payload.get("applied")})
            }
        };
        operator::present(&result, as_json, "Linked accounts", None)
    }
}

fn account_action(client: &RuntimeClient, action: &str, provider: &str) -> Result<Value> {
    Ok(client.control(
        ControlMethod::Post,
        &format!("/accounts/{action}"),
        Some(&json!({"provider": provider})),
    )?)
}

fn oauth(
    client: &RuntimeClient,
    provider: Provider,
    label: Option<String>,
    manual: bool,
    as_json: bool,
    running_signals: Option<&AtomicUsize>,
) -> Result<()> {
    let local_signals = running_signals
        .is_none()
        .then(turn::interrupts)
        .transpose()?;
    let signals = running_signals
        .or(local_signals.as_deref())
        .context("Provider sign-in cancellation is unavailable")?;
    let mut identity = json!({"provider": provider.as_str()});
    if let Some(label) = label {
        identity["label"] = Value::String(label);
    }
    let started = client.control(
        ControlMethod::Post,
        "/accounts/oauth/start",
        Some(&identity),
    )?;
    let flow = started
        .get("flow")
        .context("Provider did not start a sign-in flow")?;
    let id = flow
        .get("id")
        .and_then(Value::as_str)
        .context("Provider sign-in omitted its session ID")?;
    ensure!(
        id.len() <= 128
            && !id.is_empty()
            && id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_'),
        "Invalid provider sign-in session ID"
    );
    let result = finish_oauth(client, provider, flow, id, manual, signals);
    if result.is_err() {
        let _ = client.control(
            ControlMethod::Post,
            "/accounts/oauth/cancel",
            Some(&json!({"flowId": id})),
        );
    }
    operator::present(&result?, as_json, "Account connected", None)
}

fn finish_oauth(
    client: &RuntimeClient,
    provider: Provider,
    flow: &Value,
    id: &str,
    manual: bool,
    signals: &AtomicUsize,
) -> Result<Value> {
    let start_signal = signals.load(Ordering::Relaxed);
    let authorization = flow
        .get("authUrl")
        .and_then(Value::as_str)
        .context("Provider omitted the sign-in page")?;
    let prefix = match provider {
        Provider::Codex => "https://auth.openai.com/oauth/authorize?",
        Provider::ClaudeCode => "https://claude.ai/oauth/authorize?",
        Provider::Elizacloud => bail!("ElizaCloud uses local account setup"),
    };
    ensure!(
        authorization.starts_with(prefix)
            && authorization.len() <= 4096
            && authorization.bytes().all(|byte| byte.is_ascii_graphic()),
        "Unexpected provider sign-in page"
    );
    eprintln!("Open this provider sign-in page in your browser:\n{authorization}");
    if manual || flow.get("needsCodeSubmission").and_then(Value::as_bool) == Some(true) {
        let code = hidden_input(if matches!(provider, Provider::Codex) {
            "Paste the provider callback URL › "
        } else {
            "Paste the provider authorization code › "
        })?;
        let _ = client
            .control(
                ControlMethod::Post,
                "/accounts/oauth/code",
                Some(&json!({"flowId": id, "code": code})),
            )
            .map_err(|_| anyhow::anyhow!("Provider authorization could not be confirmed"))?;
    }
    let path = format!("/accounts/oauth/status?flowId={id}");
    let started = Instant::now();
    while started.elapsed() < Duration::from_secs(600)
        && signals.load(Ordering::Relaxed) == start_signal
    {
        let result = client.get_json(&path, None)?;
        let current = result
            .get("flow")
            .context("Provider sign-in state is unavailable")?;
        match current.get("status").and_then(Value::as_str) {
            Some("success") => {
                return Ok(
                    json!({"provider": provider.as_str(), "account": current.get("account"), "status": "connected"}),
                );
            }
            Some("error" | "cancelled" | "timeout") => {
                bail!("Provider sign-in did not complete")
            }
            _ => thread::sleep(Duration::from_secs(1)),
        }
    }
    bail!("Provider sign-in ended before confirmation")
}

fn hidden_input(prompt: &str) -> Result<String> {
    ensure!(
        std::io::stdin().is_terminal() && std::io::stderr().is_terminal(),
        "Provider authorization requires an interactive terminal"
    );
    ensure!(
        !std::env::var("TERM").is_ok_and(|term| ["dumb", "cons25", "emacs"]
            .iter()
            .any(|unsupported| term.eq_ignore_ascii_case(unsupported))),
        "Provider authorization needs terminal input masking"
    );
    #[cfg(unix)]
    let _echo = NoEcho::enter()?;
    let config = Config::builder()
        .behavior(Behavior::PreferTerm)
        .color_mode(ColorMode::Forced)
        .auto_add_history(false)
        .build();
    let mut editor = Editor::<SecretMask, MemHistory>::with_config(config)?;
    editor.set_helper(Some(SecretMask));
    let code = editor
        .readline(prompt)
        .map_err(|_| anyhow::anyhow!("Provider authorization input ended"))?;
    let code = code.trim();
    ensure!(
        !code.is_empty() && code.len() <= 8192 && code.bytes().all(|byte| byte.is_ascii_graphic()),
        "Invalid provider authorization input"
    );
    Ok(code.into())
}

#[cfg(unix)]
struct NoEcho {
    tool: &'static str,
    mode: String,
    terminal: std::fs::File,
}

#[cfg(unix)]
impl NoEcho {
    fn enter() -> Result<Self> {
        use std::process::Command;

        let terminal = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open("/dev/tty")
            .context("Provider authorization requires a controlling terminal")?;

        let tool = ["/bin/stty", "/usr/bin/stty"]
            .into_iter()
            .find(|path| std::path::Path::new(path).is_file())
            .context("Cannot mask input on this terminal")?;
        let original = Command::new(tool)
            .arg("-g")
            .stdin(terminal.try_clone()?)
            .output()?;
        ensure!(
            original.status.success(),
            "Cannot read protected terminal input settings"
        );
        let mode = String::from_utf8(original.stdout)?.trim().to_owned();
        let guard = Self {
            tool,
            mode,
            terminal,
        };
        let status = Command::new(tool)
            .arg("-echo")
            .stdin(guard.terminal.try_clone()?)
            .status()?;
        ensure!(status.success(), "Cannot mask protected terminal input");
        Ok(guard)
    }
}

#[cfg(unix)]
impl Drop for NoEcho {
    fn drop(&mut self) {
        if let Ok(terminal) = self.terminal.try_clone() {
            let _ = std::process::Command::new(self.tool)
                .arg(&self.mode)
                .stdin(terminal)
                .status();
        }
    }
}

struct SecretMask;

impl Helper for SecretMask {}
impl Completer for SecretMask {
    type Candidate = String;
}
impl Validator for SecretMask {}
impl Hinter for SecretMask {
    type Hint = String;
}
impl Highlighter for SecretMask {
    fn highlight<'a>(&self, line: &'a str, _pos: usize) -> Cow<'a, str> {
        Cow::Owned("*".repeat(line.chars().count()))
    }

    fn highlight_char(&self, _line: &str, _pos: usize, _kind: CmdKind) -> bool {
        true
    }
}
