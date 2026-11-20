use std::io::{self, IsTerminal, Read};
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result, ensure};
use clap::{Parser, Subcommand};
use doolittle_host::{RuntimeService, RuntimeSidecar, SidecarConfig};
use doolittle_runtime::{RunStatus, RuntimeClient, SessionSummary};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

mod accounts;
mod jobs;
mod launcher;
mod operator;
mod repl;
mod turn;

const MAX_PROMPT_BYTES: usize = 256 * 1024;

#[derive(Parser)]
#[command(
    version,
    about = "Native terminal client for the Doolittle ElizaOS runtime"
)]
struct Args {
    /// Connect to an existing loopback runtime with the ELIZA_API_TOKEN environment variable
    #[arg(long, global = true)]
    url: Option<String>,
    /// Workspace for a new managed runtime (defaults to the current directory)
    #[arg(long, global = true, value_name = "DIRECTORY")]
    workspace: Option<PathBuf>,
    /// Profile directory for a managed runtime
    #[arg(long, global = true, value_name = "DIRECTORY")]
    profile: Option<PathBuf>,
    /// Source checkout or packaged runtime directory for a managed runtime
    #[arg(long, global = true, value_name = "DIRECTORY")]
    runtime_root: Option<PathBuf>,
    /// Defer optional runtime initialization during startup
    #[arg(long, global = true)]
    offline: bool,
    /// Open the fullscreen operator cockpit
    #[arg(long = "cli", alias = "cockpit")]
    cockpit: bool,
    #[command(subcommand)]
    command: Option<Command>,
}

impl Args {
    fn validate_runtime_target(&self) -> Result<()> {
        ensure!(
            !self.cockpit || self.command.is_none(),
            "--cli cannot be combined with a command"
        );
        ensure!(
            self.url.is_none()
                || (self.workspace.is_none()
                    && self.profile.is_none()
                    && self.runtime_root.is_none()
                    && !self.offline),
            "--url cannot be combined with managed runtime options"
        );
        Ok(())
    }

    fn sidecar_config(&self) -> Result<SidecarConfig> {
        let current = std::env::current_dir().context("Determine the working directory")?;
        SidecarConfig::discover(
            self.workspace.as_deref().unwrap_or(current.as_path()),
            self.profile.as_deref(),
            self.runtime_root.as_deref(),
            self.offline,
        )
    }
}

#[derive(Subcommand)]
enum Command {
    /// Start an interactive conversation
    #[command(visible_aliases = ["start", "plain", "plain-cli"])]
    Chat {
        /// Resume an existing session
        #[arg(long, alias = "session-id")]
        session: Option<String>,
    },
    /// Open the fullscreen operator cockpit
    #[command(visible_alias = "tui")]
    Cockpit {
        #[arg(long, alias = "session-id")]
        session: Option<String>,
    },
    /// Run one prompt and print its final response
    #[command(visible_alias = "exec")]
    Run {
        /// Resume an existing session
        #[arg(long, alias = "session-id")]
        session: Option<String>,
        /// Print one JSON result containing the run identity and outcome
        #[arg(long, conflicts_with = "json_stream")]
        json: bool,
        /// Stream one JSON object per runtime event followed by the result
        #[arg(long)]
        json_stream: bool,
        /// Run in a detached local worker and retain the job record
        #[arg(long, conflicts_with = "json_stream")]
        background: bool,
        /// Read the prompt from standard input
        #[arg(long, alias = "prompt-stdin", conflicts_with_all = ["prompt", "prompt_option"], required_unless_present_any = ["prompt", "prompt_option"])]
        stdin: bool,
        /// Pass a prompt explicitly, including a prompt starting with a dash
        #[arg(
            short = 'p',
            long = "prompt",
            conflicts_with = "prompt",
            allow_hyphen_values = true
        )]
        prompt_option: Option<String>,
        /// Prompt words
        prompt: Vec<String>,
    },
    /// List recent conversations
    Sessions {
        #[arg(long, default_value_t = 25, value_parser = clap::value_parser!(u16).range(1..=100))]
        limit: u16,
        #[arg(long)]
        json: bool,
    },
    /// Show runtime, provider and startup status
    Status {
        #[arg(long)]
        json: bool,
    },
    /// List pending execution approvals
    Approvals {
        #[arg(long)]
        json: bool,
    },
    /// Decide an execution approval on a running runtime
    Approval {
        #[arg(long)]
        json: bool,
        #[command(subcommand)]
        action: operator::ApprovalCommand,
    },
    /// Browse recent runtime runs and their execution state
    Progress {
        #[arg(long)]
        json: bool,
        #[arg(value_parser = ["all"])]
        view: Vec<String>,
    },
    /// Browse tool summary, list, search, category, detail and transports
    Tools {
        #[arg(long)]
        json: bool,
        view: Vec<String>,
    },
    /// Browse active, installed and generated skills and the skill catalog
    Skills {
        #[arg(long)]
        json: bool,
        view: Vec<String>,
    },
    /// Inspect status, transports, plugins, registry, ecosystem and models
    Runtime {
        #[arg(long)]
        json: bool,
        view: Vec<String>,
    },
    /// Browse Doolittle's command catalog by name or keyword
    Commands {
        #[arg(long)]
        json: bool,
        filter: Vec<String>,
    },
    /// Check local runtime readiness
    #[command(visible_alias = "check")]
    Doctor {
        #[arg(long)]
        json: bool,
    },
    /// Review setup or select the provider and model for future turns
    #[command(visible_aliases = ["onboard", "bootstrap"])]
    Setup {
        #[arg(long)]
        json: bool,
        /// Display the full readiness checklist
        #[arg(long, conflicts_with = "provider")]
        checklist: bool,
        #[arg(long, requires = "model")]
        provider: Option<String>,
        #[arg(long, requires = "provider")]
        model: Option<String>,
    },
    /// List model providers and models
    Models {
        #[arg(long)]
        json: bool,
    },
    /// Inspect linked provider accounts
    Accounts {
        #[arg(long, global = true)]
        json: bool,
        #[command(subcommand)]
        action: Option<accounts::AccountCommand>,
    },
    /// List terminal themes, set a theme, or switch to next or previous
    Theme {
        #[arg(long)]
        json: bool,
        action: Vec<String>,
    },
    /// Show execution settings and backend readiness
    Execution {
        #[arg(long)]
        json: bool,
    },
    /// See gateway readiness or installed transports
    GatewayStatus {
        #[arg(long)]
        json: bool,
        view: Vec<String>,
    },
    /// View recent agent activity
    Activity {
        #[arg(long)]
        json: bool,
    },
    /// List and manage profile automations
    Automations {
        #[arg(long, global = true)]
        json: bool,
        #[command(subcommand)]
        action: Option<operator::AutomationCommand>,
    },
    /// Print the Doolittle product version
    Version,
    /// Build or open the native GPUI desktop
    #[command(visible_alias = "gui")]
    Desktop {
        #[arg(long)]
        source: bool,
        #[arg(long)]
        build_only: bool,
        #[arg(long, conflicts_with = "force_build")]
        skip_build: bool,
        #[arg(long)]
        force_build: bool,
    },
    /// Serve the ElizaOS ACP protocol over standard input and output
    Acp,
    /// Start the ElizaOS gateway on loopback using ELIZA_API_TOKEN
    Gateway,
    /// Start the ElizaOS API on loopback using ELIZA_API_TOKEN
    Api,
    /// Check the bundled Rust tool and runtime probe
    Native {
        #[command(subcommand)]
        action: Option<launcher::NativeCommand>,
    },
    /// List, show, attach to, or cancel locally managed background jobs
    Jobs {
        #[arg(long, global = true)]
        json: bool,
        #[command(subcommand)]
        action: Option<jobs::JobCommand>,
    },
    #[command(hide = true)]
    JobWorker { id: String },
    /// Inspect a run on an existing runtime
    Receipt {
        run: String,
        #[arg(long)]
        json: bool,
    },
    /// Request cancellation of a run on an existing runtime
    Cancel { run: String },
    /// List files in the workspace bound to a conversation
    Tree {
        #[arg(long)]
        session: String,
        #[arg(long, default_value_t = 2, value_parser = clap::value_parser!(u8).range(1..=4))]
        depth: u8,
    },
    /// Read a text file from the workspace bound to a conversation
    Read {
        #[arg(long)]
        session: String,
        path: String,
    },
}

struct Connection {
    client: RuntimeClient,
    _sidecar: Option<RuntimeSidecar>,
}

impl Connection {
    fn open(args: &Args) -> Result<Self> {
        if let Some(url) = &args.url {
            let token = std::env::var("ELIZA_API_TOKEN")
                .context("Set ELIZA_API_TOKEN to connect to an existing runtime")?;
            return Ok(Self {
                client: RuntimeClient::new(url, &token)?,
                _sidecar: None,
            });
        }

        let config = args.sidecar_config()?;
        let sidecar = RuntimeSidecar::launch(&config.with_controls())?;
        let client = RuntimeClient::new(sidecar.endpoint(), sidecar.token())?;
        Ok(Self {
            client,
            _sidecar: Some(sidecar),
        })
    }
}

fn main() -> ExitCode {
    match execute(Args::parse()) {
        Ok(code) => code,
        Err(error) => {
            eprintln!("Doolittle: {}", terminal_text(&format!("{error:#}")));
            ExitCode::FAILURE
        }
    }
}

fn execute(mut args: Args) -> Result<ExitCode> {
    args.validate_runtime_target()?;
    let command = args.command.take().unwrap_or(if args.cockpit {
        Command::Cockpit { session: None }
    } else {
        Command::Chat { session: None }
    });
    let command = match command {
        Command::Version => {
            println!("Doolittle {}", env!("CARGO_PKG_VERSION"));
            return Ok(ExitCode::SUCCESS);
        }
        Command::Desktop {
            source,
            build_only,
            skip_build,
            force_build,
        } => {
            return launcher::desktop(&args, source, build_only, skip_build, force_build);
        }
        Command::Acp => return launcher::serve(&args, RuntimeService::Acp),
        Command::Gateway => return launcher::serve(&args, RuntimeService::Gateway),
        Command::Api => return launcher::serve(&args, RuntimeService::Api),
        Command::Native { action } => {
            return launcher::native(&args, action.unwrap_or(launcher::NativeCommand::Status));
        }
        Command::Jobs { json, action } => {
            return action
                .unwrap_or(jobs::JobCommand::List)
                .execute(&args, json);
        }
        Command::JobWorker { id } => return jobs::worker(&args, &id),
        other => other,
    };
    if matches!(&command, Command::Cancel { .. } | Command::Approval { .. }) {
        ensure!(args.url.is_some(), "Specify --url for the running runtime");
    }
    if matches!(&command, Command::Cockpit { .. }) {
        ensure!(
            io::stdin().is_terminal() && io::stdout().is_terminal(),
            "The cockpit needs an interactive terminal"
        );
    }

    // Read and validate prompt input before starting a managed agent.
    let prompt = match &command {
        Command::Run { stdin: true, .. } | Command::Chat { .. } if !io::stdin().is_terminal() => {
            Some(read_prompt(io::stdin().lock())?)
        }
        Command::Run { stdin: true, .. } => {
            anyhow::bail!("--prompt-stdin requires non-interactive stdin")
        }
        Command::Run {
            prompt_option,
            prompt,
            ..
        } => Some(checked_prompt(
            prompt_option.clone().unwrap_or_else(|| prompt.join(" ")),
        )?),
        _ => None,
    };
    if let Command::Run {
        background: true,
        session,
        json,
        ..
    } = &command
    {
        return jobs::launch(
            &args,
            session.clone().unwrap_or_else(new_id),
            prompt.unwrap_or_default(),
            *json,
        );
    }
    let connection = Connection::open(&args)?;
    let client = &connection.client;

    match command {
        Command::Chat { session } => {
            let signals = turn::interrupts()?;
            let session = session.unwrap_or_else(new_id);
            if let Some(prompt) = prompt {
                return finish_turn(
                    &turn::send(client, &session, &prompt, &signals, turn::Output::Silent)?,
                    false,
                    false,
                );
            }
            repl::run(client, session, &signals, false)?;
        }
        Command::Cockpit { session } => {
            let signals = turn::interrupts()?;
            repl::run(client, session.unwrap_or_else(new_id), &signals, true)?;
        }
        Command::Run {
            session,
            json,
            json_stream,
            ..
        } => {
            let session = session.unwrap_or_else(new_id);
            let signals = turn::interrupts()?;
            let result = turn::send(
                client,
                &session,
                prompt.as_deref().unwrap_or_default(),
                &signals,
                if json_stream {
                    turn::Output::JsonLines
                } else {
                    turn::Output::Silent
                },
            )?;
            return finish_turn(&result, json, json_stream);
        }
        Command::Sessions { limit, json } => {
            let sessions = client.sessions(usize::from(limit))?;
            if json {
                print_json(&sessions)?;
            } else {
                print_sessions(&sessions);
            }
        }
        Command::Status { json } => operator::inspect(client, "status", &[], json)?,
        Command::Progress { json, view } => operator::inspect(client, "progress", &view, json)?,
        Command::Tools { json, view } => operator::inspect(client, "tools", &view, json)?,
        Command::Skills { json, view } => operator::inspect(client, "skills", &view, json)?,
        Command::Runtime { json, view } => operator::inspect(client, "runtime", &view, json)?,
        Command::Commands { json, filter } => operator::inspect(client, "commands", &filter, json)?,
        Command::Doctor { json } => operator::inspect(client, "doctor", &[], json)?,
        Command::Models { json } => operator::inspect(client, "models", &[], json)?,
        Command::Accounts { json, action } => action
            .unwrap_or(accounts::AccountCommand::List)
            .execute(client, json)?,
        Command::Theme { json, action } => operator::theme(client, &action.join(" "), json)?,
        Command::Execution { json } => operator::inspect(client, "execution", &[], json)?,
        Command::GatewayStatus { json, view } => operator::inspect(client, "gateway", &view, json)?,
        Command::Activity { json } => operator::inspect(client, "activity", &[], json)?,
        Command::Automations { json, action } => action
            .unwrap_or(operator::AutomationCommand::List)
            .execute(client, json)?,
        Command::Setup {
            json,
            checklist,
            provider,
            model,
        } => {
            if let Some((provider, model)) = provider.zip(model) {
                operator::select_model(client, provider, model, json)?;
            } else {
                let args = if checklist {
                    vec!["checklist".into()]
                } else {
                    vec![]
                };
                operator::inspect(client, "setup", &args, json)?;
            }
        }
        Command::Approvals { json } => print_approvals(client, json)?,
        Command::Approval { action, json } => operator::present(
            &action.execute(client)?,
            json,
            "Approval updated",
            Some("approval"),
        )?,
        Command::Receipt { run, json } => {
            let receipt = client.run(&run)?;
            if json {
                print_json(&json!({
                    "runId": receipt.run_id,
                    "sessionId": receipt.session_id,
                    "status": receipt.status.as_str(),
                    "pendingApprovals": receipt.pending_approvals,
                    "activeAction": receipt.active_action,
                    "statusDetail": receipt.status_detail,
                    "errorMessage": receipt.error_message,
                }))?;
            } else {
                println!(
                    "{}  {}",
                    terminal_text(&receipt.run_id),
                    receipt.status.as_str()
                );
                if let Some(detail) = receipt.error_message.or(receipt.status_detail) {
                    println!("{}", terminal_text(&detail));
                }
            }
        }
        Command::Cancel { run } => {
            let receipt = client.cancel_run(&run)?;
            match receipt.status {
                RunStatus::Cancelled => println!("Cancelled {}", terminal_text(&receipt.run_id)),
                status if status.is_terminal() => {
                    println!("{}  {}", terminal_text(&receipt.run_id), status.as_str(),)
                }
                _ => println!(
                    "Cancellation requested for {}",
                    terminal_text(&receipt.run_id)
                ),
            }
        }
        Command::Tree { session, depth } => print_tree(client, &session, depth)?,
        Command::Read { session, path } => print_file(client, &session, &path)?,
        Command::Version
        | Command::Desktop { .. }
        | Command::Acp
        | Command::Gateway
        | Command::Api
        | Command::Native { .. }
        | Command::Jobs { .. }
        | Command::JobWorker { .. } => unreachable!("this command is handled before startup"),
    }

    Ok(ExitCode::SUCCESS)
}

fn finish_turn(result: &turn::Outcome, json: bool, json_stream: bool) -> Result<ExitCode> {
    if json_stream {
        print_json(&json!({"type": "result", "outcome": result}))?;
    } else if json {
        print_json(result)?;
    } else {
        match result.status {
            turn::OutcomeStatus::Complete => println!("{}", terminal_text(&result.text)),
            turn::OutcomeStatus::Cancelled => eprintln!("Cancelled {}", result.run_id),
            _ => {
                if let Some(error) = &result.error {
                    eprintln!("{}", terminal_text(error));
                }
            }
        }
    }
    Ok(result.exit_code())
}

fn print_json(value: &impl Serialize) -> Result<()> {
    use std::io::Write as _;

    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, value)?;
    writeln!(stdout)?;
    stdout.flush()?;
    Ok(())
}

fn print_sessions(sessions: &[SessionSummary]) {
    if sessions.is_empty() {
        println!("No saved conversations.");
    }
    for session in sessions {
        let title = session.title.as_deref().unwrap_or("Untitled");
        println!(
            "{}  {}  ({} messages)",
            terminal_text(&session.session_id),
            terminal_text(title).replace('\n', " "),
            session.message_count
        );
    }
}

fn print_approvals(client: &RuntimeClient, json: bool) -> Result<()> {
    let payload = client.get_json("/execution/approvals?status=pending", None)?;
    if json {
        return print_json(&payload);
    }
    let approvals = payload
        .get("approvals")
        .and_then(Value::as_array)
        .context("Runtime approval list is malformed")?;
    if approvals.is_empty() {
        println!("No pending approvals.");
    }
    for approval in approvals {
        let id = approval
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("Approval");
        let label = approval
            .get("summary")
            .or_else(|| approval.get("reason"))
            .and_then(Value::as_str)
            .unwrap_or("Pending execution approval");
        println!("{}  {}", terminal_text(id), terminal_text(label));
    }
    Ok(())
}

fn print_tree(client: &RuntimeClient, session: &str, depth: u8) -> Result<()> {
    let tree = client.workspace_tree(session, depth)?;
    for entry in tree.entries {
        let marker = if entry.kind == "directory" || entry.kind == "dir" {
            "/"
        } else {
            ""
        };
        println!("{}{}", terminal_text(&entry.path), marker);
    }
    if tree.truncated {
        eprintln!("The workspace tree is truncated.");
    }
    Ok(())
}

fn print_file(client: &RuntimeClient, session: &str, path: &str) -> Result<()> {
    let file = client.read_file(session, path)?;
    print!("{}", terminal_text(&file.content));
    if !file.content.ends_with('\n') {
        println!();
    }
    Ok(())
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn read_prompt(input: impl Read) -> Result<String> {
    let mut prompt = String::new();
    input
        .take((MAX_PROMPT_BYTES + 1) as u64)
        .read_to_string(&mut prompt)
        .context("Read a UTF-8 prompt from standard input")?;
    checked_prompt(prompt)
}

fn checked_prompt(prompt: String) -> Result<String> {
    ensure!(prompt.len() <= MAX_PROMPT_BYTES, "Prompt exceeds 256 KiB");
    ensure!(!prompt.trim().is_empty(), "Prompt is empty");
    Ok(prompt)
}

/// Treat runtime text as data when displaying it in a terminal.
fn terminal_text(text: &str) -> String {
    text.chars()
        .filter(|ch| matches!(ch, '\n' | '\t') || !ch.is_control())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_text_keeps_content_without_terminal_controls() {
        assert_eq!(
            terminal_text("pretty\ttext\n\x1b[2J\u{85}"),
            "pretty\ttext\n[2J"
        );
    }

    #[test]
    fn piped_prompts_are_nonempty_and_bounded() {
        assert_eq!(read_prompt("a\nb".as_bytes()).unwrap(), "a\nb");
        assert!(read_prompt("  ".as_bytes()).is_err());
        assert!(read_prompt(&vec![b'a'; MAX_PROMPT_BYTES + 1][..]).is_err());
    }

    #[test]
    fn attach_flags_cannot_override_the_running_workspace() {
        let parsed = Args::try_parse_from([
            "doolittle-native",
            "--url",
            "http://127.0.0.1:9123",
            "status",
            "--workspace",
            "/tmp",
        ]);
        assert!(parsed.unwrap().validate_runtime_target().is_err());
    }
}
