use std::io::{self, Read};
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::{Context, Result, ensure};
use clap::{Parser, Subcommand};
use doolittle_host::{RuntimeSidecar, SidecarConfig};
use doolittle_runtime::{RunStatus, RuntimeClient, SessionSummary};
use serde::Serialize;
use serde_json::{Value, json};
use uuid::Uuid;

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
    #[command(subcommand)]
    command: Option<Command>,
}

impl Args {
    fn validate_runtime_target(&self) -> Result<()> {
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
}

#[derive(Subcommand)]
enum Command {
    /// Start an interactive conversation
    Chat {
        /// Resume an existing session
        #[arg(long)]
        session: Option<String>,
    },
    /// Run one prompt and print its final response
    Run {
        /// Resume an existing session
        #[arg(long)]
        session: Option<String>,
        /// Print one JSON result containing the run identity and outcome
        #[arg(long)]
        json: bool,
        /// Read the prompt from standard input
        #[arg(long, conflicts_with = "prompt", required_unless_present = "prompt")]
        stdin: bool,
        #[arg(required_unless_present = "stdin")]
        prompt: Option<String>,
    },
    /// List recent conversations
    Sessions {
        #[arg(long, default_value_t = 25, value_parser = clap::value_parser!(u16).range(1..=100))]
        limit: u16,
        #[arg(long)]
        json: bool,
    },
    /// Show the runtime health response
    Status {
        #[arg(long)]
        json: bool,
    },
    /// List pending execution approvals
    Approvals {
        #[arg(long)]
        json: bool,
    },
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

        let current = std::env::current_dir().context("Determine the working directory")?;
        let config = SidecarConfig::discover(
            args.workspace.as_deref().unwrap_or(current.as_path()),
            args.profile.as_deref(),
            args.runtime_root.as_deref(),
            args.offline,
        )?;
        let sidecar = RuntimeSidecar::launch(&config)?;
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
    let command = args
        .command
        .take()
        .unwrap_or(Command::Chat { session: None });
    if matches!(&command, Command::Cancel { .. } | Command::Receipt { .. }) {
        ensure!(args.url.is_some(), "Specify --url for the running runtime");
    }

    // Read and validate prompt input before starting a managed agent.
    let prompt = if let Command::Run { stdin, prompt, .. } = &command {
        Some(if *stdin {
            read_prompt(io::stdin().lock())?
        } else {
            checked_prompt(prompt.as_deref().unwrap_or_default().to_owned())?
        })
    } else {
        None
    };
    let connection = Connection::open(&args)?;
    let client = &connection.client;

    match command {
        Command::Chat { session } => {
            let signals = turn::interrupts()?;
            repl::run(client, session.unwrap_or_else(new_id), &signals)?;
        }
        Command::Run { session, json, .. } => {
            let session = session.unwrap_or_else(new_id);
            let signals = turn::interrupts()?;
            let result = turn::send(
                client,
                &session,
                prompt.as_deref().unwrap_or_default(),
                &signals,
                false,
            )?;
            if json {
                print_json(&result)?;
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
            return Ok(result.exit_code());
        }
        Command::Sessions { limit, json } => {
            let sessions = client.sessions(usize::from(limit))?;
            if json {
                print_json(&sessions)?;
            } else {
                print_sessions(&sessions);
            }
        }
        Command::Status { json } => {
            let health = client.get_json("/health", None)?;
            if json {
                print_json(&health)?;
            } else {
                let status = health
                    .get("status")
                    .and_then(Value::as_str)
                    .unwrap_or("reachable");
                println!("Runtime {}", terminal_text(status));
            }
        }
        Command::Approvals { json } => print_approvals(client, json)?,
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
    }

    Ok(ExitCode::SUCCESS)
}

fn print_json(value: &impl Serialize) -> Result<()> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, value)?;
    use std::io::Write;
    writeln!(stdout)?;
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
