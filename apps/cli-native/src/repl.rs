use std::io::{self, IsTerminal as _, Write as _};
use std::sync::atomic::AtomicUsize;

use anyhow::{Context, Result};
use clap::Parser as _;
use doolittle_runtime::RuntimeClient;
use rustyline::{DefaultEditor, error::ReadlineError};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    Args, Command, accounts::AccountCommand, checked_prompt, new_id, operator, print_approvals,
    print_file, print_message_page, print_sessions, print_tree, terminal_text, turn,
};

const PAGE_SIZE: usize = 20;

pub fn run(
    client: &RuntimeClient,
    mut session: String,
    signals: &AtomicUsize,
    cockpit: bool,
    bot: Option<Uuid>,
) -> Result<()> {
    let mut editor = DefaultEditor::new().context("Initialize terminal input")?;
    let _screen = cockpit.then(CockpitScreen::enter).transpose()?;
    let named = bot.is_some();
    let mut theme = if named {
        TerminalTheme::default()
    } else {
        TerminalTheme::load(client)
    };
    let mut offset = 0;
    if cockpit {
        print_cockpit(client, &session, &theme)?;
    } else {
        let name = bot.map_or_else(|| "Doolittle".into(), |id| format!("Named agent {id}"));
        println!(
            "{name} · {}\nType /help for commands.",
            theme.primary(&terminal_text(&session))
        );
    }
    if let Err(error) = show_history(client, &session, &mut offset) {
        eprintln!(
            "Conversation history unavailable: {}",
            terminal_text(&error.to_string())
        );
    }

    loop {
        let prompt = theme.prompt();
        let line = match editor.readline(&prompt) {
            Ok(line) => line,
            Err(ReadlineError::Interrupted) => continue,
            Err(ReadlineError::Eof) => break,
            Err(error) => return Err(error).context("Read terminal input"),
        };
        if line.trim().is_empty() {
            continue;
        }
        let _ = editor.add_history_entry(line.as_str());
        let edit_theme = !named && line.split_whitespace().next() == Some("/theme");
        let response = if line.trim_start().starts_with('/') {
            if matches!(line.trim(), "/quit" | "/exit") {
                break;
            }
            if cockpit && line.trim() == "/refresh" {
                print_cockpit(client, &session, &theme)
            } else {
                handle_command(
                    client,
                    &line,
                    &mut session,
                    &mut offset,
                    &mut editor,
                    signals,
                    named,
                )
            }
        } else {
            send(client, &session, line, signals, &mut editor, named)
        };
        if let Err(error) = response {
            eprintln!("{}", terminal_text(&format!("{error:#}")));
        } else if edit_theme {
            theme = TerminalTheme::load(client);
        }
    }

    Ok(())
}

struct CockpitScreen;

impl CockpitScreen {
    fn enter() -> io::Result<Self> {
        write_screen("\x1b[?1049h")?;
        Ok(Self)
    }
}

impl Drop for CockpitScreen {
    fn drop(&mut self) {
        let _ = write_screen("\x1b[?1049l");
    }
}

fn write_screen(control: &str) -> io::Result<()> {
    let mut output = io::stdout().lock();
    output.write_all(control.as_bytes())?;
    output.flush()
}

fn print_cockpit(client: &RuntimeClient, session: &str, theme: &TerminalTheme) -> Result<()> {
    write_screen("\x1b[H\x1b[2J")?;
    println!(
        "{} · {}",
        theme.primary("Doolittle Cockpit"),
        operator::one_line(session)
    );
    println!(
        "{}",
        theme.secondary("/sessions  /progress  /tools  /approvals  /accounts  /help  /refresh")
    );
    println!();
    for section in ["status", "progress"] {
        if let Err(error) = operator::inspect(client, section, &[], false) {
            eprintln!(
                "{} unavailable: {}",
                section,
                terminal_text(&error.to_string())
            );
        }
    }
    Ok(())
}

#[derive(Default)]
struct TerminalTheme {
    primary: Option<[u8; 3]>,
    secondary: Option<[u8; 3]>,
    glyph: Option<String>,
}

impl TerminalTheme {
    fn load(client: &RuntimeClient) -> Self {
        if !io::stdout().is_terminal() || std::env::var_os("NO_COLOR").is_some() {
            return Self::default();
        }
        let Ok(theme) = client.get_json("/theme", None) else {
            return Self::default();
        };
        let profile = &theme["profile"];
        Self {
            primary: profile.get("primary").and_then(parse_rgb),
            secondary: profile.get("secondary").and_then(parse_rgb),
            glyph: profile
                .get("shellGlyph")
                .and_then(Value::as_str)
                .filter(|glyph| glyph.chars().count() <= 4)
                .map(operator::one_line),
        }
    }

    fn primary(&self, text: &str) -> String {
        styled(text, self.primary)
    }

    fn secondary(&self, text: &str) -> String {
        styled(text, self.secondary)
    }

    fn prompt(&self) -> String {
        self.primary(&format!("You {} ", self.glyph.as_deref().unwrap_or("›")))
    }
}

fn parse_rgb(value: &Value) -> Option<[u8; 3]> {
    let value = value.as_str()?.strip_prefix('#')?;
    if value.len() != 6 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let packed = u32::from_str_radix(value, 16).ok()?.to_be_bytes();
    Some([packed[1], packed[2], packed[3]])
}

fn styled(text: &str, rgb: Option<[u8; 3]>) -> String {
    if let Some([red, green, blue]) = rgb {
        format!("\x1b[38;2;{red};{green};{blue}m{text}\x1b[0m")
    } else {
        text.into()
    }
}

fn send(
    client: &RuntimeClient,
    session: &str,
    line: String,
    signals: &AtomicUsize,
    editor: &mut DefaultEditor,
    named: bool,
) -> Result<()> {
    let prompt = checked_prompt(line)?;
    println!("Doolittle");
    let outcome = if named {
        turn::send(client, session, &prompt, signals, turn::Output::Terminal)?
    } else {
        turn::send_interactive(client, session, &prompt, signals, editor)?
    };
    match outcome.status {
        turn::OutcomeStatus::Cancelled => eprintln!("Cancelled {}", outcome.run_id),
        _ => {
            if let Some(error) = outcome.error {
                eprintln!("{}", terminal_text(&error));
            }
        }
    }
    Ok(())
}

fn handle_command(
    client: &RuntimeClient,
    line: &str,
    session: &mut String,
    offset: &mut usize,
    editor: &mut DefaultEditor,
    signals: &AtomicUsize,
    named: bool,
) -> Result<()> {
    let trimmed = line.trim();
    let (command, value) = trimmed
        .split_once(char::is_whitespace)
        .map(|(command, value)| (command, value.trim()))
        .unwrap_or((trimmed, ""));
    if named
        && !matches!(
            (command, value),
            ("/help" | "/new" | "/sessions" | "/history" | "/older", "")
                | ("/use", _)
                | ("/workspace", "tree")
        )
    {
        anyhow::bail!(
            "This command is unavailable in a named-agent chat. Type /help for conversation commands."
        );
    }
    match (command, value) {
        ("/help", "") if named => println!(
            "/new            Start another conversation\n\
             /sessions       List this agent's conversations\n\
             /use ID         Resume a conversation\n\
             /history        Show the latest messages\n\
             /older          Show earlier messages\n\
             /workspace tree List the agent workspace\n\
             /quit           Leave terminal chat\n\
             Ctrl+C          Clear input or cancel the active run"
        ),
        ("/help", "") => println!(
            "/new            Start another conversation\n\
             /sessions       List recent conversations\n\
             /use ID         Resume a conversation\n\
             /history        Show the latest messages\n\
             /older          Show earlier messages\n\
             /tree           List files for this conversation\n\
             /read PATH      Read a workspace file\n\
             /approvals      List pending execution approvals\n\
             /approve ID     Approve an exact pending execution\n\
             /deny ID        Deny an exact pending execution\n\
             /status         Show runtime readiness\n\
             /progress       Show run status and execution activity\n\
             /tools          Browse available tools\n\
             /skills         Browse active skills\n\
             /runtime        Inspect runtime capabilities\n\
             /commands       Search the command catalog\n\
             /accounts       Inspect linked model accounts\n\
             /theme          Browse or select a terminal theme\n\
             /automations    Show scheduled automations\n\
             /review         Review code with the bundled ElizaOS workflow\n\
             /release-check  Run the bundled release review\n\
             /quit           Leave terminal chat\n\
             Ctrl+C          Clear input or cancel the active run"
        ),
        ("/new", "") => {
            *session = new_id();
            *offset = 0;
            println!("New conversation · {session}");
        }
        ("/sessions", "") => print_sessions(&client.sessions(25)?),
        ("/use", selected) if !selected.is_empty() => {
            let mut resumed_offset = 0;
            show_history(client, selected, &mut resumed_offset)?;
            *session = selected.to_owned();
            *offset = resumed_offset;
            println!("Conversation · {}", terminal_text(session));
        }
        ("/history", "") => {
            *offset = 0;
            show_history(client, session, offset)?;
        }
        ("/older", "") if *offset > 0 => show_history(client, session, offset)?,
        ("/older", "") => println!("No earlier messages."),
        ("/tree", "") => print_tree(client, session, 2)?,
        ("/workspace", "tree") => send(client, session, trimmed.into(), signals, editor, named)?,
        ("/review" | "/security-review" | "/release-check", _) => {
            send(client, session, trimmed.into(), signals, editor, named)?;
        }
        ("/read", path) if !path.is_empty() => print_file(client, session, path)?,
        ("/approvals", "") => print_approvals(client, false)?,
        ("/approve" | "/deny", id) if !id.is_empty() => operator::present(
            &operator::approval(client, id, &command[1..])?,
            false,
            "Approval updated",
            Some("approval"),
        )?,
        ("/theme", action) => operator::theme(client, action, false)?,
        ("/accounts", arguments) => {
            let args = ["doolittle-native", "accounts"]
                .into_iter()
                .chain(arguments.split_whitespace());
            let options = Args::try_parse_from(args)?;
            options.validate_runtime_target()?;
            if let Some(Command::Accounts { action, .. }) = options.command {
                action
                    .unwrap_or(AccountCommand::List)
                    .execute_with_signals(client, false, Some(signals))?;
            }
        }
        ("/automations", "") => operator::AutomationCommand::List.execute(client, false)?,
        ("/automations", "runs") => operator::AutomationCommand::Runs.execute(client, false)?,
        (
            "/status" | "/progress" | "/tools" | "/skills" | "/runtime" | "/commands" | "/doctor"
            | "/setup" | "/execution" | "/gateway" | "/activity" | "/models",
            query,
        ) => {
            let args = if query.is_empty() {
                vec![]
            } else {
                vec![query.into()]
            };
            operator::inspect(client, &command[1..], &args, false)?;
        }
        _ => anyhow::bail!("Unknown command. Type /help to see available commands."),
    }
    Ok(())
}

fn show_history(client: &RuntimeClient, session: &str, offset: &mut usize) -> Result<()> {
    let page = client.messages(session, PAGE_SIZE, *offset)?;
    print_message_page(&page);
    *offset = if page.has_earlier {
        page.next_offset
    } else {
        0
    };
    Ok(())
}
