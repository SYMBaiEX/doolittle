use std::collections::HashSet;
use std::io::{self, Write};
use std::path::Path;
use std::process::ExitCode;
use std::sync::{
    Arc,
    atomic::{AtomicUsize, Ordering},
    mpsc::{RecvTimeoutError, sync_channel},
};
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use doolittle_runtime::{RunEvent, RunStatus, RuntimeClient, RuntimeError};
use rustyline::{DefaultEditor, error::ReadlineError};
use serde::Serialize;
use serde_json::{Value, json};

use crate::{new_id, operator, print_json, terminal_text};

const POLL_INTERVAL: Duration = Duration::from_millis(100);
const CANCELLATION_WAIT: Duration = Duration::from_secs(15);
const MAX_RECONNECTS: usize = 2;
const MAX_RETAINED_TEXT_BYTES: usize = 4 * 1024 * 1024;

pub fn interrupts() -> Result<Arc<AtomicUsize>> {
    let signals = Arc::new(AtomicUsize::new(0));
    let received = Arc::clone(&signals);
    ctrlc::set_handler(move || {
        received.fetch_add(1, Ordering::Relaxed);
    })
    .context("Set up terminal cancellation")?;
    Ok(signals)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OutcomeStatus {
    Complete,
    Cancelled,
    Error,
    Unconfirmed,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub session_id: String,
    pub run_id: String,
    pub status: OutcomeStatus,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl Outcome {
    pub fn exit_code(&self) -> ExitCode {
        match self.status {
            OutcomeStatus::Complete => ExitCode::SUCCESS,
            OutcomeStatus::Cancelled => ExitCode::from(130),
            OutcomeStatus::Error | OutcomeStatus::Unconfirmed => ExitCode::FAILURE,
        }
    }
}

enum Delivery {
    Event(RunEvent),
    Closed(Result<u64, RuntimeError>),
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Output {
    Silent,
    Terminal,
    JsonLines,
}

pub fn send(
    client: &RuntimeClient,
    session: &str,
    prompt: &str,
    signals: &AtomicUsize,
    output: Output,
) -> Result<Outcome> {
    send_with_approvals(client, session, prompt, signals, output, None, None)
}

pub fn send_interactive(
    client: &RuntimeClient,
    session: &str,
    prompt: &str,
    signals: &AtomicUsize,
    editor: &mut DefaultEditor,
) -> Result<Outcome> {
    send_with_approvals(
        client,
        session,
        prompt,
        signals,
        Output::Terminal,
        Some(editor),
        None,
    )
}

pub(crate) fn send_background(
    client: &RuntimeClient,
    session: &str,
    prompt: &str,
    signals: &AtomicUsize,
    cancellation: &Path,
) -> Result<Outcome> {
    send_with_approvals(
        client,
        session,
        prompt,
        signals,
        Output::JsonLines,
        None,
        Some(cancellation),
    )
}

fn send_with_approvals(
    client: &RuntimeClient,
    session: &str,
    prompt: &str,
    signals: &AtomicUsize,
    output: Output,
    mut editor: Option<&mut DefaultEditor>,
    cancellation_marker: Option<&Path>,
) -> Result<Outcome> {
    let start_signal = signals.load(Ordering::Relaxed);
    let run_id = new_id();
    if cancellation_marker.is_some_and(Path::is_file) {
        return Ok(Outcome {
            session_id: session.to_owned(),
            run_id,
            status: OutcomeStatus::Cancelled,
            text: String::new(),
            error: None,
        });
    }
    match client.start_chat_with_id(session, prompt, &run_id) {
        Ok(start) if start.run_id == run_id => {}
        Ok(_) => {
            bail!("The runtime returned a different run ID. Check run {run_id} before retrying.")
        }
        Err(submit_error) => {
            // The response can fail after the worker accepted the turn. Look up
            // the issued ID and never resend the prompt automatically.
            let accepted = client
                .run(&run_id)
                .is_ok_and(|receipt| receipt.run_id == run_id && receipt.session_id == session);
            if !accepted {
                return Err(submit_error)
                    .context(format!("Could not confirm submission for run {run_id}"));
            }
        }
    }

    if output == Output::JsonLines {
        print_json(&json!({"type": "start", "runId": run_id, "sessionId": session}))?;
    }

    let (sender, receiver) = sync_channel(64);
    let reader = client.clone();
    let reader_run_id = run_id.clone();
    thread::Builder::new()
        .name("doolittle-run-stream".into())
        .spawn(move || {
            let mut after = 0;
            for attempt in 0..=MAX_RECONNECTS {
                let result = reader.stream_run(&reader_run_id, after, |event| {
                    let terminal = event.is_terminal();
                    sender.send(Delivery::Event(event)).is_ok() && !terminal
                });
                match result {
                    Err(RuntimeError::StreamInterrupted { cursor }) if attempt < MAX_RECONNECTS => {
                        after = cursor.max(after);
                    }
                    finished => {
                        let _ = sender.send(Delivery::Closed(finished));
                        break;
                    }
                }
            }
        })
        .with_context(|| format!("Could not watch accepted run {run_id}"))?;

    let mut outcome = Outcome {
        session_id: session.into(),
        run_id,
        status: OutcomeStatus::Unconfirmed,
        text: String::new(),
        error: None,
    };
    let mut cancellation = None;
    let mut announced_approval = false;
    let mut reviewed = HashSet::new();
    loop {
        let signal_count = signals.load(Ordering::Relaxed);
        if cancellation.is_none()
            && (signal_count > start_signal || cancellation_marker.is_some_and(Path::is_file))
        {
            cancellation = Some(Instant::now());
            match client.cancel_run(&outcome.run_id) {
                Ok(receipt) if receipt.status == RunStatus::Cancelled => {
                    outcome.status = OutcomeStatus::Cancelled;
                    break;
                }
                Ok(_) => eprintln!("Cancellation requested."),
                Err(error) => eprintln!(
                    "Cancellation could not be confirmed: {}",
                    terminal_text(&error.to_string())
                ),
            }
        }
        if cancellation.is_some_and(|requested| {
            requested.elapsed() >= CANCELLATION_WAIT
                || signal_count > start_signal.saturating_add(1)
        }) {
            outcome.error = Some(format!(
                "Cancellation remains unconfirmed for run {}.",
                outcome.run_id
            ));
            break;
        }

        match receiver.recv_timeout(POLL_INTERVAL) {
            Ok(Delivery::Event(event)) => {
                if output == Output::JsonLines {
                    print_json(&json!({
                        "type": "event",
                        "runId": outcome.run_id,
                        "event": event.kind,
                        "cursor": event.cursor,
                        "data": event.data,
                    }))?;
                }
                if let Some(delta) = event.delta() {
                    if outcome.text.len().saturating_add(delta.len()) > MAX_RETAINED_TEXT_BYTES {
                        outcome.error = Some(format!(
                            "Response exceeded the terminal output limit. Check run {} for its outcome.",
                            outcome.run_id
                        ));
                        break;
                    }
                    if output == Output::Terminal {
                        write_terminal(delta)?;
                    }
                    outcome.text.push_str(delta);
                }
                if output == Output::Terminal
                    && let Some(action) = started_action(&event)
                {
                    eprintln!("\nUsing {}", terminal_text(action));
                }
                if !event.is_terminal() && needs_approval(&event) {
                    if output != Output::JsonLines && !announced_approval {
                        eprintln!(
                            "\nRun {} is waiting for execution approval.",
                            outcome.run_id
                        );
                        announced_approval = true;
                    }
                    if let Some(editor) = editor.as_deref_mut()
                        && let Err(error) =
                            review_pending(client, session, &outcome.run_id, editor, &mut reviewed)
                    {
                        eprintln!(
                            "Approval update failed: {}",
                            terminal_text(&format!("{error:#}"))
                        );
                    }
                }
                if event.is_terminal() {
                    apply_terminal(&mut outcome, &event, output == Output::Terminal)?;
                    break;
                }
            }
            Ok(Delivery::Closed(result)) => {
                let detail = result
                    .err()
                    .map(|error| format!(" {error}"))
                    .unwrap_or_default();
                confirm_early_close(client, &mut outcome, &detail);
                break;
            }
            Err(RecvTimeoutError::Timeout) => continue,
            Err(RecvTimeoutError::Disconnected) => {
                confirm_early_close(client, &mut outcome, "");
                break;
            }
        }
    }

    if output == Output::Terminal && !outcome.text.is_empty() && !outcome.text.ends_with('\n') {
        write_terminal("\n")?;
    }
    Ok(outcome)
}

fn review_pending(
    client: &RuntimeClient,
    session: &str,
    run_id: &str,
    editor: &mut DefaultEditor,
    reviewed: &mut HashSet<String>,
) -> Result<()> {
    let pending = client.get_json("/execution/approvals?status=pending", None)?;
    let approvals = pending
        .get("approvals")
        .and_then(Value::as_array)
        .context("Runtime approval list is malformed")?;
    for approval in approvals {
        let Some(id) = approval.get("id").and_then(Value::as_str) else {
            continue;
        };
        if approval.get("sessionId").and_then(Value::as_str) != Some(session)
            || approval.get("runId").and_then(Value::as_str) != Some(run_id)
            || !reviewed.insert(id.to_owned())
        {
            continue;
        }
        let Some(command) = approval.get("command").and_then(Value::as_str) else {
            continue;
        };
        println!("\nExecution approval {}", operator::one_line(id));
        println!("  {}", operator::one_line(command));
        if let Some(reason) = approval.get("reason").and_then(Value::as_str) {
            println!("  {}", operator::one_line(reason));
        }
        let decision =
            match editor.readline("Type approve, deny, or press Enter to leave pending › ") {
                Ok(decision) => decision,
                Err(ReadlineError::Interrupted | ReadlineError::Eof) => continue,
                Err(error) => return Err(error).context("Read execution approval decision"),
            };
        let decision = decision.trim();
        if matches!(decision, "approve" | "deny") {
            let _ = operator::approval(client, id, decision)?;
            println!("Approval updated.");
        } else {
            println!("Approval remains pending.");
        }
    }
    Ok(())
}

fn apply_terminal(outcome: &mut Outcome, event: &RunEvent, stream_output: bool) -> Result<()> {
    match event.kind.as_str() {
        "response.completed" => {
            outcome.status = OutcomeStatus::Complete;
            if let Some(final_text) = event.final_response() {
                if stream_output {
                    if let Some(remainder) = final_text.strip_prefix(&outcome.text) {
                        write_terminal(remainder)?;
                    } else {
                        write_terminal("\n\nFinal response\n")?;
                        write_terminal(final_text)?;
                    }
                }
                outcome.text = final_text.into();
            }
        }
        "response.cancelled" => {
            outcome.status = OutcomeStatus::Cancelled;
        }
        "response.failed" => {
            outcome.status = OutcomeStatus::Error;
            outcome.error = Some(
                event
                    .data
                    .get("message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("The runtime reported a failed run.")
                    .into(),
            );
        }
        _ => {
            outcome.error = Some(format!(
                "The runtime sent an unsupported terminal event for run {}.",
                outcome.run_id
            ));
        }
    }
    Ok(())
}

fn started_action(event: &RunEvent) -> Option<&str> {
    if event.kind == "agent.run" && event.data.get("type")?.as_str()? == "action-started" {
        event.data.pointer("/run/activeAction")?.as_str()
    } else {
        None
    }
}

fn needs_approval(event: &RunEvent) -> bool {
    event.kind == "agent.run"
        && event
            .data
            .pointer("/run/pendingApprovals")
            .and_then(serde_json::Value::as_u64)
            .is_some_and(|pending| pending > 0)
}

fn confirm_early_close(client: &RuntimeClient, outcome: &mut Outcome, detail: &str) {
    if let Ok(receipt) = client.run(&outcome.run_id) {
        match receipt.status {
            RunStatus::Cancelled => {
                outcome.status = OutcomeStatus::Cancelled;
                return;
            }
            RunStatus::Error => {
                outcome.status = OutcomeStatus::Error;
                outcome.error = Some(
                    receipt
                        .error_message
                        .unwrap_or_else(|| "The runtime reported a failed run.".into()),
                );
                return;
            }
            _ => {}
        }
    }
    outcome.error = Some(format!(
        "The stream closed before confirming the final response for run {}.{detail}",
        outcome.run_id,
    ));
}

fn write_terminal(text: &str) -> io::Result<()> {
    let mut out = io::stdout().lock();
    out.write_all(terminal_text(text).as_bytes())?;
    out.flush()
}
