use std::collections::{HashMap, HashSet};
use std::rc::Rc;

use anyhow::Result;
use async_channel::{Sender, bounded};
use doolittle_host::{RuntimeSidecar, SidecarConfig};
use doolittle_runtime::{
    MessageAttachment, RuntimeClient, RuntimeError, SessionSummary, WorkspaceEntry,
    WorkspaceSaveOutcome,
};
use gpui::{
    App, AppContext, Context, Entity, FocusHandle, Focusable, KeyBinding, PathPromptOptions,
    PromptButton, PromptLevel, ScrollHandle, SharedString, Subscription, WeakEntity, Window,
    actions, px,
};
use gpui_component::{
    Rope,
    highlighter::Language,
    input::{InputEvent, InputState},
};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    Options,
    connections::{ConnectionsPage, ConnectionsState},
    control_plane::ControlState,
    markdown_text,
    operations::{OperationsState, OpsPage},
    pane_store::{self, PaneAgent, PaneSession, PaneSnapshot},
    panes::{PRIMARY_PANE, PaneId, PaneLayout, SplitDirection},
    session_transfer::TransferState,
    workspace_tools::WorkspaceTools,
};

actions!(
    doolittle,
    [
        SendMessage,
        NewConversation,
        AgentView,
        IdeView,
        SaveFile,
        OpenNavigation,
        OpenWorkspace,
        OpenSettings,
        ToggleSidebar
    ]
);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum View {
    Agent,
    Ide,
    Operations(OpsPage),
    Connections(ConnectionsPage),
}

pub struct Message {
    pub role: String,
    pub text: String,
    pub attachments: Vec<MessageAttachment>,
    pub wallet_activities: Vec<Value>,
}

pub struct ActiveRun {
    pub id: String,
    pub prompt: String,
    pub reply: String,
    pub status: String,
    pub interrupted: bool,
    pub started: bool,
    pub cancelling: bool,
    pub wallet_activities: Vec<Value>,
    pub attachments: Vec<MessageAttachment>,
    cursor: u64,
    final_response: Option<String>,
}

#[derive(Default)]
pub struct Conversation {
    pub title: Option<String>,
    pub draft: String,
    pub draft_attachments: Vec<MessageAttachment>,
    pub choosing_attachments: bool,
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

struct OutgoingTurn {
    prompt: String,
    attachment_ids: Vec<String>,
}

#[derive(Default)]
pub struct Workspace {
    pub entries: Vec<WorkspaceEntry>,
    pub collapsed: HashSet<String>,
    pub file: Option<OpenFile>,
    pub error: Option<String>,
    pub file_error: Option<String>,
    pub loading_tree: bool,
    pub loading_file: Option<String>,
    pub truncated: bool,
    loaded_for: Option<String>,
}

pub struct OpenFile {
    pub path: String,
    pub editor: Entity<InputState>,
    base: SharedString,
    pub saving: bool,
    pub stale: bool,
    _editor_events: Subscription,
}

impl OpenFile {
    pub fn is_dirty(&self, cx: &App) -> bool {
        !same_file_contents(self.editor.read(cx).text(), self.base.as_str())
    }
}

struct LiveRuntime {
    _sidecar: RuntimeSidecar,
    client: RuntimeClient,
    workspace: std::path::PathBuf,
    profile: std::path::PathBuf,
    #[cfg(unix)]
    workspace_identity: (u64, u64),
}

#[derive(Clone)]
struct NamedConversation {
    id: String,
    name: String,
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
        wallet_activities: Option<Vec<Value>>,
    },
    Interrupted {
        cursor: u64,
        detail: String,
    },
    Completed {
        detail: Option<String>,
        wallet_activities: Vec<Value>,
    },
}

pub struct Workbench {
    options: Options,
    pub view: View,
    pub selected: String,
    pub active: HashMap<String, Conversation>,
    pub sessions: Vec<SessionSummary>,
    sidebar_preference: Option<bool>,
    compact_sidebar_open: bool,
    pub(crate) show_tools: bool,
    pub(crate) shell_focus: FocusHandle,
    pub explorer_open: bool,
    pub composer: gpui::Entity<InputState>,
    _composer_events: Subscription,
    pub(crate) navigation_updates: Option<Subscription>,
    pub transcript_scroll: ScrollHandle,
    pub workspace: Workspace,
    editors: HashMap<String, Workspace>,
    workspace_epoch: u64,
    confirming_discard: bool,
    pub connecting: bool,
    pub choosing_workspace: bool,
    pub error: Option<String>,
    pub(crate) migration_notice: Option<String>,
    pub session_error: Option<String>,
    pub sessions_loading: bool,
    pub(crate) controls: ControlState,
    pub(crate) operations: OperationsState,
    pub(crate) transfer: TransferState,
    pub(crate) connections: ConnectionsState,
    pub(crate) workspace_tools: WorkspaceTools,
    pub(crate) pane_layout: PaneLayout,
    pub(crate) pane_entities: HashMap<PaneId, Entity<Workbench>>,
    pane_host: Option<WeakEntity<Workbench>>,
    preserve_layout_file: bool,
    layout_save_queued: bool,
    pub(crate) pane_id: PaneId,
    named: Option<NamedConversation>,
    runtime: Option<Rc<LiveRuntime>>,
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
            KeyBinding::new(&format!("{modifier}-s"), SaveFile, Some("Doolittle")),
            KeyBinding::new(&format!("{modifier}-k"), OpenNavigation, Some("Doolittle")),
            KeyBinding::new(&format!("{modifier}-o"), OpenWorkspace, Some("Doolittle")),
            KeyBinding::new(&format!("{modifier}-,"), OpenSettings, Some("Doolittle")),
            KeyBinding::new(
                &format!("{modifier}-shift-b"),
                ToggleSidebar,
                Some("Doolittle"),
            ),
            KeyBinding::new(
                "secondary-enter",
                SendMessage,
                Some("DoolittleComposer > Input"),
            ),
        ]);
    }

    pub fn new(options: Options, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let mut this = Self::build(options, window, cx);
        this.shell_focus.focus(window);
        this.connect(window, cx);
        this
    }

    fn build(options: Options, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let composer = cx.new(|cx| {
            InputState::new(window, cx)
                .placeholder("Message Doolittle")
                .auto_grow(2, 8)
        });
        let composer_events = cx.subscribe(&composer, |_, _, event, cx| {
            if matches!(event, InputEvent::Change) {
                cx.notify();
            }
        });
        let selected = Uuid::new_v4().to_string();
        Self {
            options,
            view: View::Agent,
            selected: selected.clone(),
            active: HashMap::from([(selected, Conversation::default())]),
            sessions: Vec::new(),
            sidebar_preference: None,
            compact_sidebar_open: false,
            show_tools: false,
            shell_focus: cx.focus_handle(),
            explorer_open: true,
            composer,
            _composer_events: composer_events,
            navigation_updates: None,
            transcript_scroll: ScrollHandle::new(),
            workspace: Workspace::default(),
            editors: HashMap::new(),
            workspace_epoch: 0,
            confirming_discard: false,
            connecting: false,
            choosing_workspace: false,
            error: None,
            migration_notice: None,
            session_error: None,
            sessions_loading: false,
            controls: ControlState::default(),
            operations: OperationsState::default(),
            transfer: TransferState::default(),
            connections: ConnectionsState::default(),
            workspace_tools: WorkspaceTools::default(),
            pane_layout: PaneLayout::default(),
            pane_entities: HashMap::new(),
            pane_host: None,
            preserve_layout_file: false,
            layout_save_queued: false,
            pane_id: PRIMARY_PANE,
            named: None,
            runtime: None,
        }
    }

    pub(crate) fn is_auxiliary_pane(&self) -> bool {
        self.pane_host.is_some()
    }

    pub(crate) fn wide_sidebar(&self, window: &Window) -> bool {
        window.viewport_size().width >= px(820.)
    }

    pub(crate) fn sidebar_visible(&self, window: &Window) -> bool {
        if self.wide_sidebar(window) {
            self.sidebar_preference
                .unwrap_or(self.ready() && matches!(self.view, View::Agent | View::Operations(_)))
        } else {
            self.compact_sidebar_open
        }
    }

    pub(crate) fn content_width(&self, window: &Window, cx: &App) -> gpui::Pixels {
        let width = window.viewport_size().width;
        if self.wide_sidebar(window) && self.sidebar_visible(window) {
            width - crate::themes::Palette::current(cx).navigation_width()
        } else {
            width
        }
    }

    pub(crate) fn toggle_sidebar(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let open = !self.sidebar_visible(window);
        if self.wide_sidebar(window) {
            self.sidebar_preference = Some(open);
        } else {
            self.compact_sidebar_open = open;
        }
        self.shell_focus.focus(window);
        cx.notify();
    }

    pub(crate) fn send_from_composer(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.view == View::Agent && self.composer.read(cx).focus_handle(cx).is_focused(window) {
            self.send(window, cx);
        }
    }

    pub(crate) fn split_pane(
        &mut self,
        direction: SplitDirection,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if let Some(host) = self.pane_host.as_ref() {
            let anchor = self.pane_id;
            let named = self.named.clone();
            let _ = host.update(cx, |parent, cx| {
                parent.add_pane(anchor, direction, named, None, window, cx);
            });
        } else {
            self.add_pane(PRIMARY_PANE, direction, None, None, window, cx);
        }
    }

    pub(crate) fn open_named_agent(
        &mut self,
        id: String,
        name: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_named_agent(id, name, None, window, cx);
    }

    pub(crate) fn open_named_agent_session(
        &mut self,
        id: String,
        name: String,
        session_id: String,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_named_agent(id, name, Some(session_id), window, cx);
    }

    fn show_named_agent(
        &mut self,
        id: String,
        name: String,
        session: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(runtime) = &self.runtime else {
            return;
        };
        let Ok(client) = runtime.client.for_named_bot(&id) else {
            return;
        };
        let open = self.pane_entities.iter().find_map(|(pane_id, pane)| {
            (self.pane_layout.is_open(*pane_id) && pane.read(cx).named.as_ref()?.id == id)
                .then_some(*pane_id)
        });
        self.set_view(View::Agent, window, cx);
        if let Some(pane) =
            open.filter(|pane| self.pane_layout.focused() == *pane || self.pane_layout.focus(*pane))
        {
            if let Some(selected) = session
                && let Some(child) = self.pane_entities.get(&pane)
            {
                child.update(cx, |child, cx| {
                    child.select_conversation(selected, None, window, cx)
                });
            }
            self.focus_pane_composer(pane, window, cx);
            self.persist_layout(cx);
            cx.notify();
        } else {
            self.add_pane(
                PRIMARY_PANE,
                SplitDirection::Right,
                Some(NamedConversation { id, name, client }),
                session,
                window,
                cx,
            );
        }
    }

    pub(crate) fn assistant_name(&self) -> &str {
        self.named
            .as_ref()
            .map_or("Doolittle", |named| named.name.as_str())
    }

    pub(crate) fn uses_named_agent(&self) -> bool {
        self.named.is_some()
    }

    fn add_pane(
        &mut self,
        anchor: PaneId,
        direction: SplitDirection,
        named: Option<NamedConversation>,
        session: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(runtime) = self.runtime.as_ref().cloned() else {
            return;
        };
        let Some(id) = self.pane_layout.split(anchor, direction) else {
            self.error = Some("Close a conversation pane before opening another.".into());
            cx.notify();
            return;
        };
        self.error = None;
        let pane = self.build_pane(id, runtime, named, session, window, cx);
        self.pane_entities.insert(id, pane.clone());
        self.pane_layout.focus(id);
        pane.update(cx, |pane, cx| pane.focus_composer(window, cx));
        self.persist_layout(cx);
        cx.notify();
    }

    fn build_pane(
        &self,
        id: PaneId,
        runtime: Rc<LiveRuntime>,
        named: Option<NamedConversation>,
        session: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Entity<Self> {
        let options = self.options.clone();
        let parent = cx.entity().downgrade();
        cx.new(|cx| {
            let mut pane = Self::build(options, window, cx);
            pane.runtime = Some(runtime);
            pane.pane_id = id;
            pane.pane_host = Some(parent);
            pane.named = named;
            if let Some(session) = session {
                pane.selected = session.clone();
                pane.active = HashMap::from([(session, Conversation::default())]);
                pane.load_history(false, cx);
            }
            pane.refresh_sessions(cx);
            pane
        })
    }

    pub(crate) fn close_pane(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(host) = self.pane_host.as_ref() else {
            return;
        };
        let id = self.pane_id;
        let _ = host.update(cx, |parent, cx| {
            if parent.pane_layout.close(id) {
                parent
                    .pane_entities
                    .retain(|id, _| parent.pane_layout.retains(*id));
                parent.focus_pane_composer(parent.pane_layout.focused(), window, cx);
                parent.persist_layout(cx);
                cx.notify();
            }
        });
    }

    pub(crate) fn reopen_pane(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(id) = self.pane_layout.reopen() {
            self.focus_pane_composer(id, window, cx);
            self.persist_layout(cx);
            cx.notify();
        }
    }

    pub(crate) fn next_pane(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(host) = self.pane_host.as_ref() {
            let anchor = self.pane_id;
            let _ = host.update(cx, |parent, cx| parent.advance_pane(anchor, window, cx));
        } else {
            self.advance_pane(PRIMARY_PANE, window, cx);
        }
    }

    fn advance_pane(&mut self, anchor: PaneId, window: &mut Window, cx: &mut Context<Self>) {
        self.pane_layout.focus(anchor);
        let selected = self.pane_layout.cycle_focus();
        self.focus_pane_composer(selected, window, cx);
        self.persist_layout(cx);
        cx.notify();
    }

    fn focus_pane_composer(&self, selected: PaneId, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(pane) = self.pane_entities.get(&selected) {
            pane.update(cx, |pane, cx| pane.focus_composer(window, cx));
        } else {
            self.focus_composer(window, cx);
        }
    }

    fn restore_layout(
        &mut self,
        snapshot: PaneSnapshot,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(runtime) = self.runtime.clone() else {
            return;
        };
        self.pane_layout = snapshot.layout;
        for (id, pane) in snapshot.sessions {
            if id == PRIMARY_PANE {
                let draft = self.composer.read(cx).value().to_string();
                let entry = self.active.entry(pane.session.clone()).or_default();
                entry.draft = draft;
                self.selected = pane.session;
                self.load_history(false, cx);
                continue;
            }
            let named = pane.agent.and_then(|agent| {
                let client = runtime.client.for_named_bot(&agent.id).ok()?;
                Some(NamedConversation {
                    id: agent.id,
                    name: agent.name,
                    client,
                })
            });
            let pane = self.build_pane(id, runtime.clone(), named, Some(pane.session), window, cx);
            self.pane_entities.insert(id, pane);
        }
    }

    fn persist_layout(&mut self, cx: &mut Context<Self>) {
        if self.preserve_layout_file {
            return;
        }
        if let Some(parent) = self.pane_host.clone() {
            cx.defer(move |cx| {
                let _ = parent.update(cx, |host, cx| host.persist_layout(cx));
            });
            return;
        }
        if self.layout_save_queued || self.runtime.is_none() {
            return;
        }
        self.layout_save_queued = true;
        let host = cx.entity().downgrade();
        cx.defer(move |cx| {
            let _ = host.update(cx, |host, cx| {
                host.layout_save_queued = false;
                host.write_layout(cx);
            });
        });
    }

    fn write_layout(&mut self, cx: &mut Context<Self>) {
        let Some(runtime) = &self.runtime else {
            return;
        };
        let session = |pane: &Self| PaneSession {
            session: pane.selected.clone(),
            agent: pane.named.as_ref().map(|agent| PaneAgent {
                id: agent.id.clone(),
                name: agent.name.clone(),
            }),
        };
        let sessions = std::iter::once((PRIMARY_PANE, session(self)))
            .chain(
                self.pane_entities
                    .iter()
                    .map(|(id, pane)| (*id, session(pane.read(cx)))),
            )
            .collect();
        let state = PaneSnapshot::new(self.pane_layout.clone(), sessions);
        if pane_store::save(&runtime.profile, &state).is_err() {
            self.error = Some("Could not save this window's conversation layout.".into());
        }
    }

    pub(crate) fn resize_panes(&mut self, split: u64, sizes: [f32; 2], cx: &mut Context<Self>) {
        if self.pane_layout.resize(split, sizes) {
            self.persist_layout(cx);
        }
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

    pub(crate) fn selected_workspace(&self) -> Option<std::path::PathBuf> {
        let runtime = self.runtime.as_ref()?;
        let current = runtime.workspace.canonicalize().ok()?;
        if current != runtime.workspace {
            return None;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt as _;
            let identity = current.metadata().ok()?;
            if runtime.workspace_identity != (identity.dev(), identity.ino()) {
                return None;
            }
        }
        Some(current)
    }

    pub fn choose_workspace(&mut self, window: &mut Window, cx: &mut Context<Self>) {
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
        cx.spawn_in(window, async move |this, cx| {
            let selected = result.await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.choosing_workspace = false;
                match selected {
                    Ok(Ok(Some(paths))) => {
                        if let Some(path) = paths.into_iter().next() {
                            this.open_workspace_path(path, window, cx);
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

    pub(crate) fn open_personal_workspace(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if self.choosing_workspace || self.connecting {
            return;
        }
        match doolittle_host::personal_workspace() {
            Ok(path) => self.open_workspace_path(path, window, cx),
            Err(error) => self.error = Some(error.to_string()),
        }
        cx.notify();
    }

    fn open_workspace_path(
        &mut self,
        path: std::path::PathBuf,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let path = match path.canonicalize() {
            Ok(path) if path.is_dir() => path,
            _ => {
                self.error =
                    Some("This folder is no longer available. Choose another workspace.".into());
                return;
            }
        };
        let current = self
            .options
            .workspace
            .as_deref()
            .and_then(|path| path.canonicalize().ok());
        if current.as_ref() == Some(&path) {
            self.connect(window, cx);
            return;
        }
        if crate::activate_workbench(&path, window.window_handle().window_id(), cx) {
            return;
        }
        if self.ready() {
            let mut options = self.options.clone();
            options.workspace = Some(path);
            options.profile = None;
            if let Err(error) = crate::open_workbench(options, cx) {
                self.error = Some(error.to_string());
            }
        } else {
            if self.options.workspace.is_some() {
                self.options.profile = None;
            }
            if let Some(name) = path.file_name() {
                window.set_window_title(&format!("Doolittle — {}", name.to_string_lossy()));
            }
            self.options.workspace = Some(path);
            self.compact_sidebar_open = false;
            self.connect(window, cx);
        }
    }

    pub(crate) fn requested_workspace(&self) -> Option<&std::path::Path> {
        self.options.workspace.as_deref()
    }

    pub fn ready(&self) -> bool {
        self.runtime.is_some()
    }

    pub(crate) fn runtime_client(&self) -> Option<RuntimeClient> {
        self.named
            .as_ref()
            .map(|named| named.client.clone())
            .or_else(|| self.runtime.as_ref().map(|runtime| runtime.client.clone()))
    }

    pub fn conversation(&self) -> &Conversation {
        &self.active[&self.selected]
    }

    pub(crate) fn session_title<'a>(&'a self, session: &'a SessionSummary) -> Option<&'a str> {
        self.active
            .get(&session.session_id)
            .and_then(|entry| entry.title.as_deref())
            .or(session.title.as_deref())
            .or_else(|| {
                let preview = session.preview.first()?.trim();
                Some(preview.strip_prefix("[user] ").unwrap_or(preview))
            })
            .filter(|label| !label.trim().is_empty())
    }

    pub(crate) fn editor_file_name(&self, session: &str) -> Option<&str> {
        let workspace = if session == self.selected {
            &self.workspace
        } else {
            self.editors.get(session)?
        };
        let path = std::path::Path::new(&workspace.file.as_ref()?.path);
        path.file_name()?.to_str()
    }

    pub fn connect(&mut self, window: &mut Window, cx: &mut Context<Self>) {
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
            let result = (|| -> Result<(LiveRuntime, Result<Option<PaneSnapshot>>)> {
                let config = SidecarConfig::discover(
                    &workspace,
                    options.profile.as_deref(),
                    options.runtime_root.as_deref(),
                    options.offline,
                )?
                .with_workspace_saves()
                .with_controls();
                let workspace = config.workspace().to_owned();
                let profile = config.profile().to_owned();
                #[cfg(unix)]
                let workspace_identity = {
                    use std::os::unix::fs::MetadataExt as _;
                    let identity = workspace.metadata()?;
                    (identity.dev(), identity.ino())
                };
                let sidecar = RuntimeSidecar::launch(&config)?;
                let client = RuntimeClient::new(sidecar.endpoint(), sidecar.token())?;
                let saved = pane_store::load(&profile);
                Ok((
                    LiveRuntime {
                        _sidecar: sidecar,
                        client,
                        workspace,
                        profile,
                        #[cfg(unix)]
                        workspace_identity,
                    },
                    saved,
                ))
            })();
            let _ = tx.send_blocking(result);
        });
        cx.spawn_in(window, async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update_in(cx, |this, window, cx| {
                this.connecting = false;
                match result {
                    Ok((runtime, saved)) => {
                        this.migration_notice = runtime._sidecar.profile_migration().map(|report| {
                            if report.deferred {
                                String::from("Profile import will resume the next time you open this workspace. Close the previous app before retrying.")
                            } else {
                                let mut notice = format!("Imported {} conversations from your previous Doolittle profile.", report.imported_conversations);
                                if report.settings_imported {
                                    notice.push_str(" Compatible settings were copied.");
                                }
                                if report.skipped_conversations > 0 {
                                    notice.push_str(&format!(" {} conversations were skipped.", report.skipped_conversations));
                                }
                                notice
                            }
                        });
                        this.runtime = Some(Rc::new(runtime));
                        match saved {
                            Ok(Some(snapshot)) => this.restore_layout(snapshot, window, cx),
                            Ok(None) => {},
                            Err(_) => {
                                this.preserve_layout_file = true;
                                this.error = Some("Saved conversation panes could not be loaded. Doolittle opened a new layout.".into());
                            }
                        }
                        this.refresh_sessions(cx);
                        this.control_get(crate::connections::SETTINGS, cx);
                        if this.view == View::Ide {
                            this.refresh_workspace(cx);
                        }
                        this.refresh_destination(cx);
                        if this.view == View::Agent && this.shell_focus.is_focused(window) {
                            this.focus_pane_composer(this.pane_layout.focused(), window, cx);
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
        self.show_tools = false;
        let current = self.conversation();
        let empty = current.title.is_none()
            && current.messages.is_empty()
            && current.active_run.is_none()
            && current.draft_attachments.is_empty()
            && self.composer.read(cx).value().is_empty();
        if empty
            || !self.ready()
            || self.switch_conversation(Uuid::new_v4().to_string(), None, window, cx)
        {
            self.set_view(View::Agent, window, cx);
        }
    }

    pub fn select_conversation(
        &mut self,
        id: String,
        title: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        self.show_tools = false;
        if self.selected == id {
            if !self.is_auxiliary_pane() {
                self.pane_layout.focus(PRIMARY_PANE);
            }
            self.set_view(View::Agent, window, cx);
            return;
        }
        if self.switch_conversation(id, title, window, cx) {
            self.set_view(View::Agent, window, cx);
        }
    }

    fn switch_conversation(
        &mut self,
        id: String,
        title: Option<String>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> bool {
        if self.confirming_discard {
            return false;
        }
        if self.workspace.file.as_ref().is_some_and(|file| file.saving) {
            self.workspace.file_error =
                Some("Wait for the file save to finish before switching chats.".into());
            self.set_view(View::Ide, window, cx);
            return false;
        }
        if !self.is_auxiliary_pane() {
            self.pane_layout.focus(PRIMARY_PANE);
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
        let previous = std::mem::replace(&mut self.selected, id);
        let restored = self.editors.remove(&self.selected).unwrap_or_default();
        let mut previous_workspace = std::mem::replace(&mut self.workspace, restored);
        previous_workspace.loading_tree = false;
        previous_workspace.loading_file = None;
        if previous_workspace.file.is_some() || previous_workspace.loaded_for.is_some() {
            self.editors.insert(previous, previous_workspace);
        }
        self.persist_layout(cx);
        self.composer.update(cx, |input, cx| {
            input.set_value(new_draft, window, cx);
        });
        self.workspace_epoch += 1;
        self.transcript_scroll.scroll_to_bottom();
        if load_history {
            self.load_history(false, cx);
        }
        cx.notify();
        true
    }

    pub fn set_view(&mut self, view: View, window: &mut Window, cx: &mut Context<Self>) {
        if let Some(host) = self.pane_host.as_ref().filter(|_| view != View::Agent) {
            let _ = host.update(cx, |parent, cx| parent.set_view(view, window, cx));
            return;
        }
        if self.view != view && matches!(self.view, View::Connections(_)) {
            self.connections.clear_sensitive_drafts();
        }
        self.view = view;
        if matches!(view, View::Operations(_)) {
            self.show_tools = true;
        }
        self.compact_sidebar_open = false;
        if view == View::Ide {
            if self.workspace.loaded_for.as_deref() != Some(self.selected.as_str()) {
                self.refresh_workspace(cx);
            }
            self.shell_focus.focus(window);
        } else if view == View::Agent && self.ready() {
            self.focus_pane_composer(self.pane_layout.focused(), window, cx);
        } else {
            self.shell_focus.focus(window);
        }
        self.refresh_destination(cx);
        cx.notify();
    }

    fn refresh_destination(&mut self, cx: &mut Context<Self>) {
        if !self.ready() {
            return;
        }
        let routes = match self.view {
            View::Operations(page) => {
                crate::operations::refresh(page, self, cx);
                return;
            }
            View::Connections(page) => page.routes(),
            View::Agent | View::Ide => return,
        };
        for path in routes {
            self.control_get(path, cx);
        }
    }

    pub fn focus_composer(&self, window: &mut Window, cx: &mut Context<Self>) {
        self.composer
            .update(cx, |input, cx| input.focus(window, cx));
    }

    pub(crate) fn has_unsaved_files(&self, cx: &App) -> bool {
        std::iter::once(&self.workspace)
            .chain(self.editors.values())
            .filter_map(|workspace| workspace.file.as_ref())
            .any(|file| file.is_dirty(cx))
    }

    pub fn refresh_sessions(&mut self, cx: &mut Context<Self>) {
        let Some(client) = self.runtime_client() else {
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
        let Some(client) = self.runtime_client() else {
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
                        attachments: received.attachments,
                        wallet_activities: Vec::new(),
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

    pub(crate) fn choose_attachments(&mut self, cx: &mut Context<Self>) {
        if self.uses_named_agent() {
            return;
        }
        let Some(client) = self.runtime_client() else {
            return;
        };
        let session = self.selected.clone();
        let entry = self
            .active
            .get_mut(&session)
            .expect("selected conversation");
        if entry.choosing_attachments
            || entry.active_run.is_some()
            || entry.draft_attachments.len() >= 8
        {
            return;
        }
        entry.error = None;
        entry.choosing_attachments = true;
        let remaining = 8 - entry.draft_attachments.len();
        let selection = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: remaining > 1,
            prompt: Some("Attach files".into()),
        });
        cx.spawn(async move |this, cx| {
            let result = match selection.await {
                Ok(Ok(Some(paths))) if !paths.is_empty() && paths.len() <= remaining => {
                    let (tx, rx) = bounded(1);
                    std::thread::spawn(move || {
                        let _ = tx.send_blocking(client.import_attachments(&paths));
                    });
                    match rx.recv().await {
                        Ok(Ok(attachments)) => Ok(attachments),
                        Ok(Err(error)) => Err(error.to_string()),
                        Err(_) => Err("Attachment import ended without a result.".into()),
                    }
                }
                Ok(Ok(Some(paths))) if paths.len() > remaining => {
                    Err(format!("Choose at most {remaining} more files."))
                }
                Ok(Err(error)) => Err(error.to_string()),
                _ => Ok(Vec::new()),
            };
            let _ = this.update(cx, |this, cx| {
                let Some(entry) = this.active.get_mut(&session) else {
                    return;
                };
                entry.choosing_attachments = false;
                match result {
                    Ok(attachments) => {
                        let total: u64 = entry
                            .draft_attachments
                            .iter()
                            .chain(&attachments)
                            .map(|file| file.size_bytes)
                            .sum();
                        if total <= 50 * 1024 * 1024 {
                            entry.draft_attachments.extend(attachments);
                        } else {
                            entry.error = Some(
                                "The selected files exceed the combined 50 MB message limit."
                                    .into(),
                            );
                        }
                    }
                    Err(error) => entry.error = Some(error),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub(crate) fn remove_draft_attachment(&mut self, id: &str, cx: &mut Context<Self>) {
        if let Some(entry) = self.active.get_mut(&self.selected) {
            entry.draft_attachments.retain(|file| file.id != id);
            cx.notify();
        }
    }

    pub fn send(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(client) = self.runtime_client() else {
            return;
        };
        let prompt = self.composer.read(cx).value().trim().to_owned();
        let id = self.selected.clone();
        let entry = self.active.get_mut(&id).expect("selected conversation");
        if prompt.is_empty()
            || entry.active_run.is_some()
            || entry.loading_history
            || entry.choosing_attachments
        {
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
        let attachments = std::mem::take(&mut entry.draft_attachments);
        let attachment_ids = attachments.iter().map(|file| file.id.clone()).collect();
        entry.active_run = Some(ActiveRun {
            id: run_id.clone(),
            prompt: prompt.clone(),
            reply: String::new(),
            status: "Sending".into(),
            interrupted: false,
            started: false,
            cancelling: false,
            wallet_activities: Vec::new(),
            attachments,
            cursor: 0,
            final_response: None,
        });
        self.composer
            .update(cx, |input, cx| input.set_value("", window, cx));
        self.transcript_scroll.scroll_to_bottom();
        self.follow_run(
            client,
            id,
            run_id,
            Some(OutgoingTurn {
                prompt,
                attachment_ids,
            }),
            0,
            cx,
        );
        cx.notify();
    }

    fn follow_run(
        &mut self,
        client: RuntimeClient,
        session: String,
        run_id: String,
        outgoing: Option<OutgoingTurn>,
        cursor: u64,
        cx: &mut Context<Self>,
    ) {
        let (tx, rx) = bounded(48);
        let worker_id = run_id.clone();
        let worker_session = session.clone();
        std::thread::spawn(move || {
            drive_run(client, &worker_session, &worker_id, outgoing, cursor, tx)
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
                entry.draft_attachments = run.attachments;
                entry.error = Some(error);
            }
            RunUpdate::Progress {
                cursor,
                delta,
                final_response,
                status,
                wallet_activities,
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
                if let Some(wallet_activities) = wallet_activities {
                    run.wallet_activities = wallet_activities;
                }
            }
            RunUpdate::Interrupted { cursor, detail } => {
                run.cursor = run.cursor.max(cursor);
                run.status = detail;
                run.interrupted = true;
                run.cancelling = false;
            }
            RunUpdate::Completed {
                detail,
                wallet_activities,
            } => {
                let run = entry.active_run.take().expect("current run");
                entry.messages.push(Message {
                    role: "user".into(),
                    text: markdown_text::for_transcript(&run.prompt),
                    attachments: run.attachments,
                    wallet_activities: Vec::new(),
                });
                let reply = run.final_response.unwrap_or(run.reply);
                if !reply.trim().is_empty() || !wallet_activities.is_empty() {
                    entry.messages.push(Message {
                        role: "assistant".into(),
                        text: markdown_text::for_transcript(&reply),
                        attachments: Vec::new(),
                        wallet_activities,
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
        let Some(client) = self.runtime_client() else {
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
        let Some(client) = self.runtime_client() else {
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
        let Some(client) = self.runtime_client() else {
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
                    }
                    Err(error) => this.workspace.error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn open_file(
        &mut self,
        path: String,
        hide_explorer: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        if self
            .workspace
            .file
            .as_ref()
            .is_some_and(|file| file.path == path)
        {
            if hide_explorer {
                self.explorer_open = false;
            }
            crate::workspace_tools::reveal_editor(self, window, cx);
            if self.view == View::Ide
                && let Some(file) = &self.workspace.file
            {
                file.editor.update(cx, |input, cx| input.focus(window, cx));
            }
            cx.notify();
            return;
        }
        self.after_discard(window, cx, move |this, window, cx| {
            this.read_file(path, hide_explorer, window, cx);
        });
    }

    pub fn reload_file(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(path) = self.workspace.file.as_ref().map(|file| file.path.clone()) else {
            return;
        };
        self.after_discard(window, cx, move |this, window, cx| {
            this.read_file(path, false, window, cx);
        });
    }

    fn read_file(
        &mut self,
        path: String,
        hide_explorer: bool,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) {
        let Some(client) = self.runtime_client() else {
            return;
        };
        if self.workspace.loading_file.is_some() {
            return;
        }
        let epoch = self.workspace_epoch;
        self.workspace.loading_file = Some(path.clone());
        self.workspace.file_error = None;
        let session = self.selected.clone();
        let request_session = session.clone();
        let request_path = path.clone();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.read_file(&request_session, &request_path));
        });
        cx.spawn_in(window, async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update_in(cx, |this, window, cx| {
                if this.selected != session
                    || this.workspace_epoch != epoch
                    || this.workspace.loading_file.as_deref() != Some(&path)
                {
                    return;
                }
                this.workspace.loading_file = None;
                match result {
                    Ok(file) => {
                        let base = SharedString::from(file.content);
                        let editor = cx.new(|cx| {
                            InputState::new(window, cx)
                                .code_editor(file_language(&path))
                                .line_number(true)
                                .soft_wrap(false)
                                .default_value(base.clone())
                        });
                        let editor_events = cx.subscribe(&editor, |_, _, event, cx| {
                            if matches!(event, InputEvent::Change) {
                                cx.notify();
                            }
                        });
                        if hide_explorer {
                            this.explorer_open = false;
                        }
                        crate::workspace_tools::reveal_editor(this, window, cx);
                        if this.view == View::Ide
                            && !this.compact_sidebar_open
                            && !this.confirming_discard
                        {
                            editor.update(cx, |input, cx| input.focus(window, cx));
                        }
                        this.workspace.file = Some(OpenFile {
                            path,
                            editor,
                            base,
                            saving: false,
                            stale: false,
                            _editor_events: editor_events,
                        });
                    }
                    Err(error) => this.workspace.file_error = Some(error.to_string()),
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn save_file(&mut self, cx: &mut Context<Self>) {
        if self.confirming_discard || self.workspace.loading_file.is_some() {
            return;
        }
        let Some(client) = self.runtime_client() else {
            return;
        };
        let Some(file) = self.workspace.file.as_mut() else {
            return;
        };
        let submitted = file.editor.read(cx).value();
        if file.saving || file.stale || submitted == file.base {
            return;
        }
        file.saving = true;
        self.workspace.file_error = None;
        let base = file.base.clone();
        let path = file.path.clone();
        let editor_id = file.editor.entity_id();
        let epoch = self.workspace_epoch;
        let session = self.selected.clone();
        let request_text = submitted.clone();
        let (tx, rx) = bounded(1);
        std::thread::spawn(move || {
            let _ = tx.send_blocking(client.save_file(
                &session,
                &path,
                base.as_str(),
                request_text.as_str(),
            ));
        });
        cx.spawn(async move |this, cx| {
            let Ok(result) = rx.recv().await else { return };
            let _ = this.update(cx, |this, cx| {
                if this.workspace_epoch != epoch {
                    return;
                }
                let Some(file) = this.workspace.file.as_mut().filter(|file| {
                    file.editor.entity_id() == editor_id
                }) else {
                    return;
                };
                file.saving = false;
                match result {
                    Ok(WorkspaceSaveOutcome::Saved { .. }) => file.base = submitted,
                    Ok(WorkspaceSaveOutcome::Conflict { .. }) => {
                        file.stale = true;
                        this.workspace.file_error = Some(
                            "The file changed on disk. Copy your edits if you want to keep them, then reload the file.".into(),
                        );
                    }
                    Err(RuntimeError::Http { code: Some(code), .. }) if code == "workspace_busy" => {
                        this.workspace.file_error = Some(
                            "The workspace is busy. Save again when the current action finishes.".into(),
                        );
                    }
                    Err(error) => {
                        this.workspace.file_error = Some(save_error_message(error));
                    }
                }
                cx.notify();
            });
        })
        .detach();
        cx.notify();
    }

    pub fn has_file_protection(&self, cx: &App) -> bool {
        self.confirming_discard || self.current_file_busy() || self.has_unsaved_files(cx)
    }

    fn current_file_busy(&self) -> bool {
        self.workspace.file.as_ref().is_some_and(|file| file.saving)
    }

    pub fn confirm_close(&mut self, window: &mut Window, cx: &mut Context<Self>) -> bool {
        if !self.has_file_protection(cx) {
            return true;
        }
        self.after_close_confirmation(window, cx, |_, window, _| window.remove_window());
        false
    }

    pub(crate) fn after_close_confirmation(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        proceed: impl FnOnce(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) {
        if self.confirming_discard {
            return;
        }
        if self.current_file_busy() {
            self.workspace.file_error =
                Some("Wait for the file save to finish before closing.".into());
            self.set_view(View::Ide, window, cx);
            crate::workspace_tools::reveal_editor(self, window, cx);
            return;
        }
        let mut paths = std::iter::once(&self.workspace)
            .chain(self.editors.values())
            .filter_map(|workspace| workspace.file.as_ref())
            .filter(|file| file.is_dirty(cx))
            .map(|file| file.path.as_str())
            .collect::<Vec<_>>();
        paths.sort_unstable();
        paths.dedup();
        if paths.is_empty() {
            proceed(self, window, cx);
        } else {
            self.confirm_discard(paths.join("\n"), window, cx, proceed);
        }
    }

    pub fn after_discard(
        &mut self,
        window: &mut Window,
        cx: &mut Context<Self>,
        proceed: impl FnOnce(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) {
        if self.confirming_discard {
            return;
        }
        if self.workspace.loading_file.is_some() {
            return;
        }
        if let Some(file) = self.workspace.file.as_ref() {
            if file.saving {
                self.explorer_open = false;
                self.set_view(View::Ide, window, cx);
                return;
            }
            if file.is_dirty(cx) {
                self.confirm_discard(file.path.clone(), window, cx, proceed);
                return;
            }
        }
        proceed(self, window, cx);
    }

    fn confirm_discard(
        &mut self,
        files: String,
        window: &mut Window,
        cx: &mut Context<Self>,
        proceed: impl FnOnce(&mut Self, &mut Window, &mut Context<Self>) + 'static,
    ) {
        self.confirming_discard = true;
        let result = window.prompt(
            PromptLevel::Warning,
            "Discard unsaved changes?",
            Some(&files),
            &[
                PromptButton::ok("Keep editing"),
                PromptButton::new("Discard changes"),
            ],
            cx,
        );
        cx.spawn_in(window, async move |this, cx| {
            let result = result.await;
            let _ = this.update_in(cx, |this, window, cx| {
                this.confirming_discard = false;
                if result == Ok(1) {
                    proceed(this, window, cx);
                }
                cx.notify();
            });
        })
        .detach();
    }
}

fn file_language(path: &str) -> &'static str {
    let path = std::path::Path::new(path);
    let language = match path.extension().and_then(|ext| ext.to_str()) {
        Some("jsx" | "mjs" | "cjs") => Language::JavaScript,
        Some(extension) => Language::from_str(extension),
        None if path.file_name().is_some_and(|name| name == "Makefile") => Language::Make,
        _ => Language::Plain,
    };
    language.name()
}

fn same_file_contents(buffer: &Rope, base: &str) -> bool {
    if buffer.len() != base.len() {
        return false;
    }
    buffer.bytes().eq(base.bytes())
}

fn save_error_message(error: RuntimeError) -> String {
    match error {
        RuntimeError::SaveTooLarge | RuntimeError::InvalidInput(_) => error.to_string(),
        RuntimeError::Http {
            status: 400..=499, ..
        } => error.to_string(),
        _ => format!("Save could not be confirmed. Your edits are still here. {error}"),
    }
}

fn drive_run(
    client: RuntimeClient,
    session: &str,
    run_id: &str,
    outgoing: Option<OutgoingTurn>,
    mut cursor: u64,
    tx: Sender<RunUpdate>,
) {
    let accepted = match outgoing {
        Some(outgoing) => match client.start_chat_with_attachments(
            session,
            &outgoing.prompt,
            run_id,
            &outgoing.attachment_ids,
        ) {
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
            wallet_activities: (event.kind == "agent.run")
                .then(|| event.data.get("walletActivities")?.as_array().cloned())
                .flatten(),
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
            RunUpdate::Completed {
                detail,
                wallet_activities: receipt.wallet_activities,
            }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_baseline_compares_exact_utf8_and_line_endings() {
        let original = "café\r\nfn main() {}\r\n";
        let buffer = Rope::from(original);
        assert_eq!(buffer.to_string(), original);
        assert!(same_file_contents(&buffer, original));
        assert!(!same_file_contents(&buffer, "café\nfn main() {}\n"));
        assert!(!same_file_contents(&buffer, "cafá\r\nfn main() {}\r\n"));
    }

    #[test]
    fn invalid_save_receipt_leaves_write_outcome_unconfirmed() {
        let message = save_error_message(RuntimeError::SaveReceiptMismatch);
        assert!(message.contains("Save could not be confirmed"));
        assert!(message.contains("Your edits are still here"));
    }
}
