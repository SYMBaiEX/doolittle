use std::collections::{HashMap, HashSet};

use anyhow::Result;
use async_channel::{Sender, bounded};
use doolittle_host::{RuntimeSidecar, SidecarConfig};
use doolittle_runtime::{RuntimeClient, SessionSummary, WorkspaceEntry};
use gpui::{
    App, AppContext, Context, KeyBinding, PathPromptOptions, ScrollHandle, Subscription, Window,
    actions, px,
};
use gpui_component::input::{InputEvent, InputState};
use uuid::Uuid;

use crate::{Options, markdown_text};

actions!(
    doolittle,
    [SendMessage, NewConversation, AgentView, IdeView]
);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum View {
    Agent,
    Ide,
}

pub struct Message {
    pub role: String,
    pub text: String,
}

pub struct ActiveRun {
    pub id: String,
    pub prompt: String,
    pub reply: String,
    pub status: String,
    pub interrupted: bool,
    pub started: bool,
    pub cancelling: bool,
    cursor: u64,
    final_response: Option<String>,
}

#[derive(Default)]
pub struct Conversation {
    pub title: Option<String>,
    pub draft: String,
    pub messages: Vec<Message>,
    pub active_run: Option<ActiveRun>,
    pub error: Option<String>,
    pub recover_prompt: Option<String>,
    pub history_error: Option<String>,
    pub loading_history: bool,
    pub loaded: bool,
    pub has_earlier: bool,
    offset: usize,
}

#[derive(Default)]
pub struct Workspace {
    pub entries: Vec<WorkspaceEntry>,
    pub collapsed: HashSet<String>,
    pub selected: Option<String>,
    pub file: Option<String>,
    pub error: Option<String>,
    pub loading_tree: bool,
    pub loading_file: bool,
    pub truncated: bool,
    loaded_for: Option<String>,
    revision: u64,
}

struct LiveRuntime {
    _sidecar: RuntimeSidecar,
    client: RuntimeClient,
}

enum RunUpdate {
    Accepted,
    Rejected(String),
    Progress {
        cursor: u64,
        delta: Option<String>,
        final_response: Option<String>,
        status: Option<String>,
    },
    Interrupted {
        cursor: u64,
        detail: String,
    },
    Completed {
        detail: Option<String>,
    },
}

pub struct Workbench {
    options: Options,
    pub view: View,
    pub selected: String,
    pub active: HashMap<String, Conversation>,
    pub sessions: Vec<SessionSummary>,
    pub sidebar_open: bool,
    pub explorer_open: bool,
    pub composer: gpui::Entity<InputState>,
    _composer_events: Subscription,
    pub transcript_scroll: ScrollHandle,
    pub workspace: Workspace,
    workspace_epoch: u64,
    pub connecting: bool,
    pub choosing_workspace: bool,
    pub error: Option<String>,
    pub session_error: Option<String>,
    pub sessions_loading: bool,
    runtime: Option<LiveRuntime>,
}

impl Workbench {
    pub fn bind_keys(cx: &mut App) {
        let modifier = if cfg!(target_os = "macos") {
            "cmd"
        } else {
            "ctrl"
        };
        cx.bind_keys([
            KeyBinding::new(&format!("{modifier}-n"), NewConversation, Some("Doolittle")),
            KeyBinding::new(&format!("{modifier}-1"), AgentView, Some("Doolittle")),
            KeyBinding::new(&format!("{modifier}-2"), IdeView, Some("Doolittle")),
        ]);
    }

    pub fn new(options: Options, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let composer = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Message Doolittle")
                .auto_grow(2, 8)
        });
        let composer_events =
            cx.subscribe_in(
                &composer,
                window,
                |this, _, event, window, cx| match event {
                    InputEvent::Change => cx.notify(),
                    InputEvent::PressEnter { secondary: true } if this.view == View::Agent => {
                        this.send(window, cx);
                    }
                    _ => {}
                },
            );
        let selected = Uuid::new_v4().to_string();
        let mut this = Self {
            options,
            view: View::Agent,
            selected: selected.clone(),
            active: HashMap::from([(selected, Conversation::default())]),
            sessions: Vec::new(),
            sidebar_open: false,
            explorer_open: true,
            composer,
            _composer_events: composer_events,
            transcript_scroll: ScrollHandle::new(),
            workspace: Workspace::default(),
            workspace_epoch: 0,
            connecting: false,
            choosing_workspace: false,
            error: None,
            session_error: None,
            sessions_loading: false,
            runtime: None,
        };
        this.connect(cx);
        this
    }

    pub fn workspace_title(&self) -> String {
        self.options
            .workspace
            .as_ref()
            .map(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().into_owned())
                    .unwrap_or_else(|| path.display().to_string())
            })
            .unwrap_or_else(|| "No workspace open".into())
    }

    pub fn workspace_path(&self) -> String {
        self.options.workspace.as_ref().map_or_else(
            || "Open a folder to start".into(),
            |path| path.display().to_string(),
        )
    }

    pub fn needs_workspace(&self) -> bool {
        self.options.workspace.is_none()
    }

    pub fn choose_workspace(&mut self, cx: &mut Context<Self>) {
        if self.choosing_workspace || self.connecting {
            return;
        }
        self.choosing_workspace = true;
        let result = cx.prompt_for_paths(PathPromptOptions {
            files: false,
            directories: true,
            multiple: false,
            prompt: Some("Open workspace".into()),
        });
        cx.spawn(async move |this, cx| {
            let selected = result.await;
            let _ = this.update(cx, |this, cx| {
                this.choosing_workspace = false;
                match selected {
                    Ok(Ok(Some(paths))) => {
                        if let Some(path) = paths.into_iter().next() {
                            if let Some(current) = &this.options.workspace {
                                if current != &path {
                                    let mut options = this.options.clone();
                                    options.workspace = Some(path);
                                    options.profile = None;
                                    if let Err(error) = crate::open_workbench(options, cx) {
                                        this.error = Some(error.to_string());
                                    }
                                }
                            } else {
                                this.options.workspace = Some(path);
                                this.connect(cx);
                            }
                        }
                    }
                    Ok(Err(error)) => this.error = Some(error.to_string()),
                    _ => {}
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn ready(&self) -> bool {
        self.runtime.is_some()
    }

    pub fn conversation(&self) -> &Conversation {
        &self.active[&self.selected]
    }

    pub fn connect(&mut self, cx: &mut Context<Self>) {
        if self.connecting || self.runtime.is_some() {
            return;
        }
        let Some(workspace) = self.options.workspace.clone() else {
            return;
        };
        self.connecting = true;
        self.error = None;
        let options = self.options.clone();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let result = (|| -> Result<LiveRuntime> {
                let config = SidecarConfig::discover(
                    &workspace,
                    options.profile.as_deref(),
                    options.runtime_root.as_deref(),
                    options.offline,
                )?;
                let sidecar = RuntimeSidecar::launch(&config)?;
                let client = RuntimeClient::new(sidecar.endpoint(), sidecar.token())?;
                Ok(LiveRuntime {
                    _sidecar: sidecar,
                    client,
                })
            })();
            let _ = tx.send_blocking(result);
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                this.connecting = false;
                match result {
                    Ok(runtime) => {
                        this.runtime = Some(runtime);
                        this.refresh_sessions(cx);
                        if this.view == View::Ide {
                            this.refresh_workspace(cx);
                        }
                    }
                    Err(error) => this.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn start_conversation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let id = Uuid::new_v4().to_string();
        self.select_conversation(id, None, window, cx);
        self.set_view(View::Agent, window, cx);
    }

    pub fn select_conversation(
        &mut self,
        id: String,
        title: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self.selected == id {
            self.sidebar_open = false;
            cx.notify();
            return;
        }
        let draft = self.composer.read(cx).value().to_string();
        self.active
            .get_mut(&self.selected)
            .expect("selected conversation")
            .draft = draft;
        let entry = self.active.entry(id.clone()).or_default();
        if entry.title.is_none() {
            entry.title = title;
        }
        let new_draft = entry.draft.clone();
        let load_history = !entry.loaded;
        self.selected = id;
        self.composer.update(cx, |input, cx| {
            input.set_value(new_draft, window, cx);
        });
        self.sidebar_open = false;
        self.workspace = Workspace::default();
        self.workspace_epoch += 1;
        self.explorer_open = true;
        self.transcript_scroll.scroll_to_bottom();
        if load_history {
            self.load_history(false, cx);
        }
        if self.view == View::Ide {
            self.refresh_workspace(cx);
        } else {
            self.focus_composer(window, cx);
        }
        cx.notify();
    }

    pub fn set_view(&mut self, view: View, window: &mut Window, cx: &mut Context<Self>) {
        self.view = view;
        if view == View::Ide {
            if self.workspace.loaded_for.as_deref() != Some(self.selected.as_str()) {
                self.refresh_workspace(cx);
            }
        } else {
            self.focus_composer(window, cx);
        }
        cx.notify();
    }

    pub fn focus_composer(&self, window: &mut Window, cx: &mut Context<Self>) {
        self.composer
            .update(cx, |input, cx| input.focus(window, cx));
    }

    pub fn refresh_sessions(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        if self.sessions_loading {
            return;
        }
        self.sessions_loading = true;
        self.session_error = None;
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.sessions(100));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                this.sessions_loading = false;
                match result {
                    Ok(sessions) => this.sessions = sessions,
                    Err(error) => this.session_error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn load_history(&mut self, earlier: bool, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        let id = self.selected.clone();
        let entry = self.active.get_mut(&id).expect("selected conversation");
        if entry.loading_history || entry.active_run.is_some() {
            return;
        }
        entry.loading_history = true;
        entry.history_error = None;
        let offset = if earlier { entry.offset } else { 0 };
        let (tx, rx) = bounded(1);
        let request_id = id.clone();
        std::thread::spawn(move || {
            let result = client.messages(&request_id, 100, offset).map(|page| {
                let messages = page
                    .messages
                    .into_iter()
                    .map(|received| Message {
                        role: received.role,
                        text: markdown_text::for_transcript(&received.text),
                    })
                    .collect::<Vec<_>>();
                (messages, page.has_earlier, page.next_offset)
            });
            let _ = tx.send_blocking(result);
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                let Some(entry) = this.active.get_mut(&id) else {
                    return;
                };
                entry.loading_history = false;
                match result {
                    Ok((mut messages, has_earlier, offset)) => {
                        if earlier {
                            messages.append(&mut entry.messages);
                        }
                        entry.messages = messages;
                        entry.has_earlier = has_earlier;
                        entry.offset = offset;
                        entry.loaded = true;
                        if !earlier && this.selected == id {
                            this.transcript_scroll.scroll_to_bottom();
                        }
                    }
                    Err(error) => entry.history_error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn send(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        let prompt = self.composer.read(cx).value().trim().to_owned();
        let id = self.selected.clone();
        let entry = self.active.get_mut(&id).expect("selected conversation");
        if prompt.is_empty() || entry.active_run.is_some() || entry.loading_history {
            return;
        }
        let run_id = Uuid::new_v4().to_string();
        if entry.title.is_none() {
            let title: String = prompt
                .lines()
                .next()
                .unwrap_or_default()
                .chars()
                .take(48)
                .collect();
            entry.title = Some(title);
        }
        entry.draft.clear();
        entry.error = None;
        entry.recover_prompt = None;
        entry.loaded = true;
        entry.active_run = Some(ActiveRun {
            id: run_id.clone(),
            prompt: prompt.clone(),
            reply: String::new(),
            status: "Sending".into(),
            interrupted: false,
            started: false,
            cancelling: false,
            cursor: 0,
            final_response: None,
        });
        self.composer
            .update(cx, |input, cx| input.set_value("", window, cx));
        self.transcript_scroll.scroll_to_bottom();
        self.follow_run(client, id, run_id, Some(prompt), 0, cx);
        cx.notify();
    }

    fn follow_run(
        &mut self,
        client: RuntimeClient,
        session: String,
        run_id: String,
        prompt: Option<String>,
        cursor: u64,
        cx: &mut Context<Self>,
    ) {
        let (tx, rx) = bounded(48);
        let worker_id = run_id.clone();
        let worker_session = session.clone();
        std::thread::spawn(move || {
            drive_run(client, &worker_session, &worker_id, prompt, cursor, tx)
        });
        cx.spawn(async move |this, cx| {
            while let Ok(update) = rx.recv().await {
                if this
                    .update(cx, |this, cx| {
                        this.apply_run_update(&session, &run_id, update, cx)
                    })
                    .is_err()
                {
                    break;
                }
            }
        })
        .detach();
    }

    fn apply_run_update(
        &mut self,
        session: &str,
        id: &str,
        update: RunUpdate,
        cx: &mut Context<Self>,
    ) {
        let follow_transcript = self.selected == session
            && self.view == View::Agent
            && self.transcript_scroll.max_offset().height + self.transcript_scroll.offset().y
                < px(40.);
        let Some(entry) = self.active.get_mut(session) else {
            return;
        };
        let Some(run) = entry.active_run.as_mut().filter(|run| run.id == id) else {
            return;
        };
        match update {
            RunUpdate::Accepted => {
                run.started = true;
                run.status = "Working".into();
            }
            RunUpdate::Rejected(error) => {
                let run = entry.active_run.take().expect("current run");
                entry.recover_prompt = Some(run.prompt);
                entry.error = Some(error);
            }
            RunUpdate::Progress {
                cursor,
                delta,
                final_response,
                status,
            } => {
                run.cursor = run.cursor.max(cursor);
                if let Some(delta) = delta {
                    run.reply.push_str(&delta);
                }
                if let Some(final_response) = final_response {
                    run.final_response = Some(final_response);
                }
                if let Some(status) = status {
                    run.status = status;
                }
            }
            RunUpdate::Interrupted { cursor, detail } => {
                run.cursor = run.cursor.max(cursor);
                run.status = detail;
                run.interrupted = true;
                run.cancelling = false;
            }
            RunUpdate::Completed { detail } => {
                let run = entry.active_run.take().expect("current run");
                entry.messages.push(Message {
                    role: "user".into(),
                    text: markdown_text::for_transcript(&run.prompt),
                });
                let reply = run.final_response.unwrap_or(run.reply);
                if !reply.trim().is_empty() {
                    entry.messages.push(Message {
                        role: "assistant".into(),
                        text: markdown_text::for_transcript(&reply),
                    });
                }
                entry.error = detail;
                if reply.trim().is_empty() {
                    // A receipt can complete after a disconnect. Reload the
                    // persisted transcript on the next visit to this chat.
                    entry.loaded = false;
                }
                self.refresh_sessions(cx);
                if self.selected == session {
                    self.workspace.loaded_for = None;
                    if self.view == View::Ide {
                        self.refresh_workspace(cx);
                    } else if reply.trim().is_empty() {
                        self.load_history(false, cx);
                    }
                }
            }
        }
        if follow_transcript {
            self.transcript_scroll.scroll_to_bottom();
        }
        cx.notify();
    }

    pub fn restore_prompt(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let entry = self
            .active
            .get_mut(&self.selected)
            .expect("selected conversation");
        let Some(prompt) = entry.recover_prompt.take() else {
            return;
        };
        let value = self.composer.read(cx).value();
        let restored = if value.trim().is_empty() {
            prompt
        } else {
            format!("{value}\n\n{prompt}")
        };
        self.composer.update(cx, |input, cx| {
            input.set_value(restored, window, cx);
            input.focus(window, cx);
        });
        entry.error = None;
        cx.notify();
    }

    pub fn resume_run(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        let session = self.selected.clone();
        let Some(run) = self
            .active
            .get_mut(&session)
            .and_then(|entry| entry.active_run.as_mut())
        else {
            return;
        };
        if !run.interrupted {
            return;
        }
        run.interrupted = false;
        run.status = "Checking run status".into();
        let id = run.id.clone();
        let cursor = run.cursor;
        self.follow_run(client, session, id, None, cursor, cx);
        cx.notify();
    }

    pub fn cancel_run(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        let session = self.selected.clone();
        let Some(run) = self
            .active
            .get_mut(&session)
            .and_then(|entry| entry.active_run.as_mut())
        else {
            return;
        };
        if !run.started || run.cancelling {
            return;
        }
        run.cancelling = true;
        run.status = "Requesting stop".into();
        let id = run.id.clone();
        let request_id = id.clone();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.cancel_run(&request_id));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                let Some(run) = this
                    .active
                    .get_mut(&session)
                    .and_then(|entry| entry.active_run.as_mut())
                    .filter(|run| run.id == id)
                else {
                    return;
                };
                match result {
                    Ok(_) => run.status = "Stopping".into(),
                    Err(error) => {
                        run.cancelling = false;
                        run.status = error.to_string();
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn refresh_workspace(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        if self.workspace.loading_tree {
            return;
        }
        let session = self.selected.clone();
        let (tx, rx) = bounded(1);
        let request_session = session.clone();
        let epoch = self.workspace_epoch;
        self.workspace.loading_tree = true;
        self.workspace.error = None;
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.workspace_tree(&request_session, 4));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                if this.selected != session || this.workspace_epoch != epoch {
                    return;
                }
                this.workspace.loading_tree = false;
                match result {
                    Ok(tree) => {
                        this.workspace.entries = tree.entries;
                        this.workspace.truncated = tree.truncated;
                        this.workspace.loaded_for = Some(session);
                        if !this.workspace.loading_file
                            && let Some(path) = this.workspace.selected.clone()
                        {
                            this.open_file(path, cx);
                        }
                    }
                    Err(error) => this.workspace.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn open_file(&mut self, path: String, cx: &mut Context<Self>) {
        let Some(client) = self.runtime.as_ref().map(|runtime| runtime.client.clone()) else {
            return;
        };
        self.workspace.revision += 1;
        let revision = self.workspace.revision;
        let epoch = self.workspace_epoch;
        self.workspace.selected = Some(path.clone());
        self.workspace.file = None;
        self.workspace.loading_file = true;
        self.workspace.error = None;
        let session = self.selected.clone();
        let request_session = session.clone();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.read_file(&request_session, &path));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                if this.selected != session
                    || this.workspace_epoch != epoch
                    || this.workspace.revision != revision
                {
                    return;
                }
                this.workspace.loading_file = false;
                match result {
                    Ok(file) => this.workspace.file = Some(file.content),
                    Err(error) => this.workspace.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }
}

fn drive_run(
    client: RuntimeClient,
    session: &str,
    run_id: &str,
    prompt: Option<String>,
    mut cursor: u64,
    tx: Sender<RunUpdate>,
) {
    let accepted = match prompt {
        Some(prompt) => match client.start_chat_with_id(session, &prompt, run_id) {
            Ok(start) if start.run_id == run_id => Ok(()),
            Ok(_) => Err("The runtime returned a different run ID.".to_owned()),
            Err(error) => match client.run(run_id) {
                Ok(found) if found.session_id == session => Ok(()),
                _ if matches!(error.http_status(), Some(400 | 401 | 403 | 409 | 413 | 422)) => {
                    let _ = tx.send_blocking(RunUpdate::Rejected(error.to_string()));
                    return;
                }
                _ => Err(format!(
                    "Send could not be confirmed. Check this run before sending again. {error}"
                )),
            },
        },
        None => match client.run(run_id) {
            Ok(found) if found.session_id == session => Ok(()),
            Ok(_) => Err("The runtime returned a different conversation.".to_owned()),
            Err(error) => Err(error.to_string()),
        },
    };
    if let Err(detail) = accepted {
        let _ = tx.send_blocking(RunUpdate::Interrupted { cursor, detail });
        return;
    }
    if tx.send_blocking(RunUpdate::Accepted).is_err() {
        return;
    }
    let stream = client.stream_run(run_id, cursor, |event| {
        cursor = event.cursor.unwrap_or(cursor).max(cursor);
        let status = progress_label(&event.kind, &event.data);
        tx.send_blocking(RunUpdate::Progress {
            cursor,
            delta: event.delta().map(|delta| delta.to_string()),
            final_response: event.final_response().map(|text| text.to_string()),
            status,
        })
        .is_ok()
    });
    let update = match client.run(run_id) {
        Ok(receipt) if receipt.session_id == session && receipt.status.is_terminal() => {
            let detail = (receipt.status.as_str() != "complete").then(|| {
                receipt
                    .error_message
                    .or(receipt.status_detail)
                    .unwrap_or_else(|| format!("Run {}", receipt.status.as_str()))
            });
            RunUpdate::Completed { detail }
        }
        _ => RunUpdate::Interrupted {
            cursor,
            detail: match stream {
                Ok(_) => "Stream ended before the runtime confirmed completion.".into(),
                Err(error) => error.to_string(),
            },
        },
    };
    let _ = tx.send_blocking(update);
}

fn progress_label(kind: &str, data: &serde_json::Value) -> Option<String> {
    match kind {
        "response.created" => Some("Working".into()),
        "agent.run" => data
            .get("statusDetail")
            .and_then(|detail| detail.as_str())
            .or_else(|| data.get("status").and_then(|status| status.as_str()))
            .map(str::to_owned),
        _ => None,
    }
}
