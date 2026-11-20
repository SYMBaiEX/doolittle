use std::sync::atomic::AtomicUsize;

use anyhow::{Context, Result};
use doolittle_runtime::RuntimeClient;
use rustyline::{DefaultEditor, error::ReadlineError};

use crate::{
    checked_prompt, new_id, print_approvals, print_file, print_sessions, print_tree, terminal_text,
    turn,
};

const PAGE_SIZE: usize = 20;

pub fn run(client: &RuntimeClient, mut session: String, signals: &AtomicUsize) -> Result<()> {
    let mut editor = DefaultEditor::new().context("Initialize terminal input")?;
    let mut offset = 0;
    println!(
        "Doolittle · {}\nType /help for commands.",
        terminal_text(&session)
    );
    if let Err(error) = show_history(client, &session, &mut offset) {
        eprintln!(
            "Conversation history unavailable: {}",
            terminal_text(&error.to_string())
        );
    }

    loop {
        let line = match editor.readline("You › ") {
            Ok(line) => line,
            Err(ReadlineError::Interrupted) => continue,
            Err(ReadlineError::Eof) => break,
            Err(error) => return Err(error).context("Read terminal input"),
        };
        if line.trim().is_empty() {
            continue;
        }
        let _ = editor.add_history_entry(line.as_str());
        let response = if line.trim_start().starts_with('/') {
            if matches!(line.trim(), "/quit" | "/exit") {
                break;
            }
            handle_command(client, &line, &mut session, &mut offset)
        } else {
            send(client, &session, line, signals)
        };
        if let Err(error) = response {
            eprintln!("{}", terminal_text(&format!("{error:#}")));
        }
    }

    Ok(())
}

fn send(client: &RuntimeClient, session: &str, line: String, signals: &AtomicUsize) -> Result<()> {
    let prompt = checked_prompt(line)?;
    println!("Doolittle");
    let outcome = turn::send(client, session, &prompt, signals, true)?;
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
) -> Result<()> {
    let trimmed = line.trim();
    let (command, value) = trimmed
        .split_once(char::is_whitespace)
        .map(|(command, value)| (command, value.trim()))
        .unwrap_or((trimmed, ""));
    match (command, value) {
        ("/help", "") => println!(
            "/new            Start another conversation\n\
             /sessions       List recent conversations\n\
             /use ID         Resume a conversation\n\
             /history        Show the latest messages\n\
             /older          Show earlier messages\n\
             /tree           List files for this conversation\n\
             /read PATH      Read a workspace file\n\
             /approvals      List pending execution approvals\n\
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
        ("/read", path) if !path.is_empty() => print_file(client, session, path)?,
        ("/approvals", "") => print_approvals(client, false)?,
        _ => anyhow::bail!("Unknown command. Type /help to see available commands."),
    }
    Ok(())
}

fn show_history(client: &RuntimeClient, session: &str, offset: &mut usize) -> Result<()> {
    let page = client.messages(session, PAGE_SIZE, *offset)?;
    for message in page.messages {
        let name = match message.role.as_str() {
            "user" => "You",
            "assistant" => "Doolittle",
            _ => continue,
        };
        println!("{name} › {}", terminal_text(&message.text));
    }
    *offset = if page.has_earlier {
        page.next_offset
    } else {
        0
    };
    Ok(())
}
