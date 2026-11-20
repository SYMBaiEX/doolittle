use std::env;
use std::fs::{self, DirBuilder, File, OpenOptions};
use std::io::{self, BufRead as _, BufReader, Read as _, Write as _};
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, ensure};
use clap::Subcommand;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{Args, Connection, checked_prompt, new_id, operator, print_json, terminal_text, turn};

const EVENT_LIMIT: u64 = 32 * 1024 * 1024;
const REPLAY_TEXT_LIMIT: usize = 4 * 1024 * 1024;
const WORKER_START_WINDOW: Duration = Duration::from_secs(2);

#[derive(Subcommand)]
pub(crate) enum JobCommand {
    /// List jobs in the selected profile
    List,
    /// Replay available events and show current state
    Show { id: String },
    /// Follow events until the runtime records a terminal state
    Attach { id: String },
    /// Request cancellation and let the worker confirm the result
    Cancel { id: String },
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Job {
    id: String,
    session_id: String,
    started_ms: u64,
}

#[derive(Serialize, Deserialize)]
struct LaunchRequest {
    challenge: String,
    prompt: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordedOutcome {
    status: turn::OutcomeStatus,
    run_id: Option<String>,
    error: Option<String>,
}

struct StoredJob {
    directory: PathBuf,
    data: Job,
}

impl JobCommand {
    pub(crate) fn execute(self, args: &Args, as_json: bool) -> Result<ExitCode> {
        ensure!(
            args.url.is_none(),
            "Background jobs belong to a local managed profile"
        );
        let root = profile_jobs(args)?;
        match self {
            Self::List => {
                let mut records = Vec::new();
                for entry in fs::read_dir(&root)? {
                    let entry = entry?;
                    let name = entry.file_name();
                    let Some(id) = name.to_str() else { continue };
                    let Ok(record) = StoredJob::open(&root, id) else {
                        continue;
                    };
                    records.push(record);
                }
                records.sort_unstable_by_key(|record| std::cmp::Reverse(record.data.started_ms));
                let rows = records
                    .into_iter()
                    .take(100)
                    .map(|job| job.summary())
                    .collect::<Result<Vec<_>>>()?;
                if as_json {
                    print_json(&rows)?;
                } else if rows.is_empty() {
                    println!("No background jobs.");
                } else {
                    for row in rows {
                        print_job(&row);
                    }
                }
            }
            Self::Show { id } => StoredJob::open(&root, &id)?.replay(false, as_json)?,
            Self::Attach { id } => return StoredJob::open(&root, &id)?.attach(as_json),
            Self::Cancel { id } => {
                let job = StoredJob::open(&root, &id)?;
                ensure!(
                    job.outcome()?.is_none() && job.worker_active()?,
                    "This job no longer has an active worker"
                );
                let marker = job.directory.join("cancel");
                match private_file(&marker) {
                    Ok(_) => {}
                    Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
                    Err(error) => return Err(error.into()),
                }
                if as_json {
                    print_json(&serde_json::json!({"id": id, "status": "cancellation_requested"}))?;
                } else {
                    println!("Cancellation requested for job {id}.");
                }
            }
        }
        Ok(ExitCode::SUCCESS)
    }
}

impl StoredJob {
    fn open(root: &Path, id: &str) -> Result<Self> {
        ensure!(is_job_id(id), "Invalid job ID");
        let directory = root.join(id);
        let metadata = fs::symlink_metadata(&directory).context("Background job not found")?;
        ensure!(metadata.is_dir(), "Background job directory is invalid");
        let data: Job = read_record(&directory.join("job.json"))?;
        ensure!(data.id == id, "Background job identity is mismatched");
        Ok(Self { directory, data })
    }

    fn outcome(&self) -> Result<Option<RecordedOutcome>> {
        let path = self.directory.join("outcome.json");
        match path.try_exists() {
            Ok(true) => read_record(&path).map(Some),
            Ok(false) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    fn worker_active(&self) -> Result<bool> {
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .open(self.directory.join("worker.lock"))?;
        use std::fs::TryLockError;
        match lock.try_lock_shared() {
            Ok(()) => Ok(now_ms().saturating_sub(self.data.started_ms)
                < WORKER_START_WINDOW.as_millis() as u64),
            Err(TryLockError::WouldBlock) => Ok(true),
            Err(TryLockError::Error(error)) => Err(error.into()),
        }
    }

    fn record_outcome(&self, outcome: &RecordedOutcome) -> Result<()> {
        let temporary = self.directory.join(format!(".result-{}", new_id()));
        write_record(&temporary, outcome)?;
        fs::rename(temporary, self.directory.join("outcome.json"))?;
        Ok(())
    }

    fn summary(&self) -> Result<Value> {
        let outcome = self.outcome()?;
        let state = if let Some(outcome) = &outcome {
            serde_json::to_value(outcome.status)?
        } else if self.worker_active()? {
            Value::String("running".into())
        } else {
            Value::String("unconfirmed".into())
        };
        Ok(
            serde_json::json!({"id": self.data.id, "sessionId": self.data.session_id, "startedMs": self.data.started_ms, "status": state, "outcome": outcome}),
        )
    }

    fn replay(&self, follow: bool, as_json: bool) -> Result<()> {
        let file = BufReader::new(File::open(self.directory.join("events.ndjson"))?);
        let mut terminal = TerminalReplay::default();
        replay_events(
            file,
            follow,
            || Ok(self.outcome()?.is_some() || !self.worker_active()?),
            |event| {
                if as_json {
                    print_json(&event)
                } else {
                    terminal.write_event(&event, follow, &mut io::stdout().lock())
                }
            },
        )?;
        let summary = self.summary()?;
        if as_json {
            print_json(&serde_json::json!({"type": "job", "job": summary}))?;
        } else {
            if terminal.line_open {
                println!();
            }
            print_job(&summary);
            if let Some(error) = summary.pointer("/outcome/error").and_then(Value::as_str) {
                eprintln!("{}", terminal_text(error));
            }
        }
        Ok(())
    }

    fn attach(&self, as_json: bool) -> Result<ExitCode> {
        self.replay(true, as_json)?;
        Ok(match self.outcome()?.map(|outcome| outcome.status) {
            Some(turn::OutcomeStatus::Complete) => ExitCode::SUCCESS,
            Some(turn::OutcomeStatus::Cancelled) => ExitCode::from(130),
            _ => ExitCode::FAILURE,
        })
    }
}

fn replay_events(
    mut file: impl io::BufRead + io::Seek,
    follow: bool,
    mut worker_finished: impl FnMut() -> Result<bool>,
    mut emit: impl FnMut(Value) -> Result<()>,
) -> Result<()> {
    let mut draining = false;
    let mut line = Vec::new();
    loop {
        let offset = file.stream_position()?;
        line.clear();
        if file
            .by_ref()
            .take(EVENT_LIMIT + 1)
            .read_until(b'\n', &mut line)?
            > 0
        {
            ensure!(
                line.len() as u64 <= EVENT_LIMIT,
                "Background event exceeded the display limit"
            );
            if line.last() == Some(&b'\n') {
                emit(serde_json::from_slice(&line).context("Invalid background run event")?)?;
                continue;
            }
            file.seek(io::SeekFrom::Start(offset))?;
        }
        if !follow || draining {
            break;
        }
        // The outcome is published after the result event is flushed. Read to
        // EOF again after observing completion in case it followed our read.
        draining = worker_finished()?;
        if !draining {
            thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(())
}

#[derive(Default)]
struct TerminalReplay {
    streamed: String,
    line_open: bool,
}

impl TerminalReplay {
    fn write_event(
        &mut self,
        event: &Value,
        follow: bool,
        output: &mut impl io::Write,
    ) -> Result<()> {
        if event.get("type").and_then(Value::as_str) == Some("result") {
            let Some(text) = event
                .pointer("/outcome/text")
                .and_then(Value::as_str)
                .filter(|text| !text.is_empty())
            else {
                return Ok(());
            };
            if let Some(remainder) = text.strip_prefix(&self.streamed) {
                self.write_text(remainder, output)?;
            } else {
                if self.line_open {
                    writeln!(output)?;
                }
                writeln!(output, "\nFinal response")?;
                self.line_open = false;
                self.write_text(text, output)?;
            }
        } else if follow
            && event.get("event").and_then(Value::as_str) == Some("response.output_text.delta")
            && let Some(delta) = event.pointer("/data/delta").and_then(Value::as_str)
            && self.streamed.len().saturating_add(delta.len()) <= REPLAY_TEXT_LIMIT
        {
            self.streamed.push_str(delta);
            self.write_text(delta, output)?;
        }
        Ok(())
    }

    fn write_text(&mut self, text: &str, output: &mut impl io::Write) -> Result<()> {
        let text = terminal_text(text);
        if !text.is_empty() {
            self.line_open = !text.ends_with('\n');
            output.write_all(text.as_bytes())?;
            output.flush()?;
        }
        Ok(())
    }
}

pub(crate) fn launch(
    args: &Args,
    session: String,
    prompt: String,
    as_json: bool,
) -> Result<ExitCode> {
    ensure!(
        args.url.is_none(),
        "Background execution requires a local managed profile"
    );
    let root = profile_jobs(args)?;
    let data = Job {
        id: new_id(),
        session_id: session,
        started_ms: now_ms(),
    };
    let directory = root.join(&data.id);
    private_directory(&directory, false)?;
    let job = StoredJob { directory, data };
    write_record(&job.directory.join("job.json"), &job.data)?;
    let challenge = new_id();
    private_file(&job.directory.join("startup"))?.write_all(challenge.as_bytes())?;
    private_file(&job.directory.join("worker.lock"))?;
    let events = private_file(&job.directory.join("events.ndjson"))?;
    let mut command = Command::new(env::current_exe()?);
    command
        .arg("job-worker")
        .arg(&job.data.id)
        .stdin(Stdio::piped())
        .stdout(Stdio::from(events))
        .stderr(Stdio::null());
    add_runtime_args(&mut command, args);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.process_group(0);
    }
    let launch = (|| -> Result<()> {
        let mut child = command.spawn().context("Start background worker")?;
        let mut input = child
            .stdin
            .take()
            .context("Open the background worker input")?;
        serde_json::to_writer(&mut input, &LaunchRequest { challenge, prompt })?;
        Ok(())
    })();
    if let Err(error) = launch {
        job.record_outcome(&RecordedOutcome {
            status: turn::OutcomeStatus::Error,
            run_id: None,
            error: Some(error.to_string()),
        })?;
        return Err(error);
    }
    if as_json {
        print_json(&job.summary()?)?;
    } else {
        println!(
            "Started background job {}. Use `doolittle-native jobs attach {}` to follow it.",
            job.data.id, job.data.id
        );
    }
    Ok(ExitCode::SUCCESS)
}

pub(crate) fn worker(args: &Args, id: &str) -> Result<ExitCode> {
    let job = StoredJob::open(&profile_jobs(args)?, id)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .open(job.directory.join("worker.lock"))?;
    lock.try_lock().context("Background job already claimed")?;
    let mut input = Vec::new();
    let max_launch_bytes = crate::MAX_PROMPT_BYTES * 6 + 1024;
    io::stdin()
        .lock()
        .take((max_launch_bytes + 1) as u64)
        .read_to_end(&mut input)?;
    ensure!(
        input.len() <= max_launch_bytes,
        "Background worker launch exceeds its input limit"
    );
    let request: LaunchRequest =
        serde_json::from_slice(&input).context("Unrecognized background worker launch")?;
    let armed = job.directory.join("startup");
    let challenge = fs::read_to_string(&armed)?;
    ensure!(
        challenge == request.challenge && is_job_id(&challenge),
        "Unrecognized background worker launch"
    );
    fs::remove_file(armed)?;
    let cancellation = job.directory.join("cancel");
    let work = (|| -> Result<turn::Outcome> {
        let prompt = checked_prompt(request.prompt)?;
        let connection = Connection::open(args)?;
        let signals = turn::interrupts()?;
        turn::send_background(
            &connection.client,
            &job.data.session_id,
            &prompt,
            &signals,
            &cancellation,
        )
    })();
    match work {
        Ok(outcome) => {
            let exit_code = crate::finish_turn(&outcome, false, true)?;
            job.record_outcome(&RecordedOutcome {
                status: outcome.status,
                run_id: Some(outcome.run_id.clone()),
                error: outcome.error.clone(),
            })?;
            Ok(exit_code)
        }
        Err(error) => {
            job.record_outcome(&RecordedOutcome {
                status: turn::OutcomeStatus::Error,
                run_id: None,
                error: Some(format!("{error:#}")),
            })?;
            Ok(ExitCode::FAILURE)
        }
    }
}

fn profile_jobs(args: &Args) -> Result<PathBuf> {
    let config = args.sidecar_config()?;
    assert_private_directory(config.profile())?;
    let root = config.profile().join("native-jobs");
    private_directory(&root, true)?;
    Ok(root)
}

fn add_runtime_args(command: &mut Command, args: &Args) {
    for (flag, path) in [
        ("--workspace", &args.workspace),
        ("--profile", &args.profile),
        ("--runtime-root", &args.runtime_root),
    ] {
        if let Some(path) = path {
            command.arg(flag).arg(path);
        }
    }
    if args.offline {
        command.arg("--offline");
    }
}

fn private_directory(path: &Path, recursive: bool) -> Result<()> {
    let mut builder = DirBuilder::new();
    builder.recursive(recursive);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt as _;
        builder.mode(0o700);
    }
    builder.create(path)?;
    assert_private_directory(path)
}

fn assert_private_directory(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    ensure!(metadata.is_dir(), "Unsafe background job directory");
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        ensure!(
            metadata.permissions().mode() & 0o077 == 0,
            "Background job profile must be accessible only to its owner"
        );
    }
    Ok(())
}

fn private_file(path: &Path) -> io::Result<File> {
    let mut builder = OpenOptions::new();
    builder.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        builder.mode(0o600);
    }
    builder.open(path)
}

fn read_record<T: for<'a> Deserialize<'a>>(path: &Path) -> Result<T> {
    ensure!(
        fs::symlink_metadata(path)?.is_file(),
        "Invalid background job record"
    );
    let mut bytes = Vec::new();
    File::open(path)?
        .take(1024 * 1024)
        .read_to_end(&mut bytes)?;
    serde_json::from_slice(&bytes).context("Invalid background job record")
}

fn write_record(path: &Path, record: &impl Serialize) -> Result<()> {
    let file = private_file(path)?;
    serde_json::to_writer(&file, record)?;
    file.sync_data()?;
    Ok(())
}

fn is_job_id(id: &str) -> bool {
    Uuid::parse_str(id).is_ok_and(|uuid| uuid.get_version_num() == 4 && uuid.to_string() == id)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn print_job(job: &Value) {
    let id = job.get("id").and_then(Value::as_str).unwrap_or("unknown");
    let status = job
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("unconfirmed");
    println!("{}  {}", operator::one_line(id), operator::one_line(status));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn terminal_replay_only_prints_unseen_response_text() -> Result<()> {
        let record = json!({"type": "result", "outcome": {"text": "Review complete"}});
        let delta = json!({"event": "response.output_text.delta", "data": {"delta": "Review"}});
        let tool_delta = json!({"event": "tool.progress", "data": {"delta": "hidden"}});
        for follow in [false, true] {
            let mut output = Vec::new();
            let mut replay = TerminalReplay::default();
            replay.write_event(&delta, follow, &mut output)?;
            replay.write_event(&tool_delta, follow, &mut output)?;
            replay.write_event(&record, follow, &mut output)?;
            assert_eq!(output, b"Review complete");
        }
        Ok(())
    }

    #[test]
    fn follows_result_appended_between_eof_and_worker_completion() -> Result<()> {
        let path = env::temp_dir().join(format!("doolittle-events-{}", new_id()));
        let mut writer = private_file(&path)?;
        writer.write_all(b"{\"type\":\"start\"}\n{\"type\":\"res")?;
        let reader = BufReader::new(File::open(&path)?);
        let mut seen = Vec::new();
        let result = replay_events(
            reader,
            true,
            || {
                // The partial read happened first. The worker completes the
                // result immediately before publishing its outcome.
                writer.write_all(b"ult\"}\n")?;
                Ok(true)
            },
            |event| {
                seen.push(event);
                Ok(())
            },
        );
        drop(writer);
        fs::remove_file(path)?;
        result?;
        assert_eq!(seen, [json!({"type": "start"}), json!({"type": "result"})]);
        Ok(())
    }
}
