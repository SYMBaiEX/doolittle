use std::{
    fs::{File, OpenOptions, symlink_metadata},
    io::{Read as _, Write as _},
    path::{Path, PathBuf},
};

use anyhow::{Context as _, Result, ensure};
use directories::UserDirs;
use doolittle_runtime::{ControlMethod, RuntimeClient};
use gpui::{Context, PathPromptOptions, PromptButton, PromptLevel, Window, div, prelude::*, px};
use gpui_component::{
    Disableable as _, Sizable as _,
    button::{Button, ButtonVariants as _},
};
use serde_json::{Value, json};

use crate::{themes::Palette, workbench::Workbench};

const MAX_ARCHIVE_BYTES: usize = 2_000_000;
const ARCHIVE_SCHEMA: &str = "doolittle.session.archive";

#[derive(Default)]
pub(crate) struct TransferState {
    busy: bool,
    feedback: Option<(String, bool)>,
}

pub(crate) fn controls(
    workbench: &Workbench,
    colors: Palette,
    cx: &mut Context<Workbench>,
) -> impl IntoElement {
    let busy = workbench.transfer.busy;
    let has_messages = !workbench.conversation().messages.is_empty()
        || workbench
            .sessions
            .iter()
            .any(|entry| entry.session_id == workbench.selected && entry.message_count > 0);
    let feedback = workbench.transfer.feedback.clone();
    div()
        .flex()
        .flex_col()
        .gap(px(4.))
        .child(
            div()
                .flex()
                .gap(px(5.))
                .child(
                    Button::new("import-conversation")
                        .small()
                        .ghost()
                        .label("Import")
                        .disabled(busy || !workbench.ready())
                        .on_click(
                            cx.listener(|this, _, window, cx| this.import_conversation(window, cx)),
                        ),
                )
                .child(
                    Button::new("export-conversation")
                        .small()
                        .ghost()
                        .label("Export")
                        .disabled(busy || !workbench.ready() || !has_messages)
                        .on_click(
                            cx.listener(|this, _, window, cx| this.export_conversation(window, cx)),
                        ),
                ),
        )
        .when_some(feedback, |section, (message, failed)| {
            section.child(
                div()
                    .text_xs()
                    .text_color(if failed { colors.danger } else { colors.muted })
                    .child(message),
            )
        })
}

impl Workbench {
    fn import_conversation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(client) = self.begin_transfer("Choose a conversation archive…", cx) else {
            return;
        };
        let current_session = self.selected.clone();
        let selected = cx.prompt_for_paths(PathPromptOptions {
            files: true,
            directories: false,
            multiple: false,
            prompt: Some("Import Conversation Archive".into()),
        });
        let executor = cx.background_executor().clone();
        cx.spawn_in(window, async move |this, cx| {
            let selected = match selected.await {
                Ok(Ok(Some(mut paths))) if paths.len() == 1 => paths.remove(0),
                Ok(Ok(_)) => {
                    let _ = this.update(cx, |this, cx| this.finish_transfer(None, cx));
                    return;
                }
                _ => {
                    let _ = this.update(cx, |this, cx| {
                        this.finish_transfer(
                            Some(("The archive chooser was unavailable.".into(), true)),
                            cx,
                        )
                    });
                    return;
                }
            };
            let review_client = client.clone();
            let review = executor
                .spawn(async move { preview_archive(&review_client, &selected) })
                .await;
            let (body, details) = match review {
                Ok(review) => review,
                Err(error) => {
                    let _ = this.update(cx, |this, cx| {
                        this.finish_transfer(
                            Some((format!("Import preview failed. {error}"), true)),
                            cx,
                        )
                    });
                    return;
                }
            };
            let Ok(confirm) = this.update_in(cx, |this, window, cx| {
                this.transfer.feedback =
                    Some(("Review the archive details before importing.".into(), false));
                cx.notify();
                window.prompt(
                    PromptLevel::Info,
                    "Import this conversation?",
                    Some(&details),
                    &[
                        PromptButton::ok("Cancel"),
                        PromptButton::new("Import conversation"),
                    ],
                    cx,
                )
            }) else {
                return;
            };
            if confirm.await != Ok(1) {
                let _ = this.update(cx, |this, cx| this.finish_transfer(None, cx));
                return;
            }
            let _ = this.update(cx, |this, cx| {
                this.transfer.feedback = Some(("Importing conversation…".into(), false));
                cx.notify();
            });
            let result = executor
                .spawn(async move { import_archive(&client, &body) })
                .await;
            let _ = this.update_in(cx, |this, window, cx| match result {
                Ok((id, title)) => {
                    this.finish_transfer(Some(("Conversation imported.".into(), false)), cx);
                    this.refresh_sessions(cx);
                    if this.selected == current_session {
                        this.select_conversation(id, title, window, cx);
                    }
                }
                Err(error) => this.finish_transfer(
                    Some((format!("Import could not be confirmed. {error}"), true)),
                    cx,
                ),
            });
        })
        .detach();
    }

    fn export_conversation(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let session = self.selected.clone();
        let Ok(route) = export_route(&session) else {
            return;
        };
        let Some(client) = self.begin_transfer("Choose where to save the conversation…", cx)
        else {
            return;
        };
        let directory = UserDirs::new()
            .and_then(|home| home.document_dir().map(PathBuf::from))
            .or_else(|| self.selected_workspace())
            .unwrap_or_else(std::env::temp_dir);
        let selected = cx.prompt_for_new_path(&directory, Some("doolittle-conversation.json"));
        let executor = cx.background_executor().clone();
        cx.spawn_in(window, async move |this, cx| {
            let feedback = match selected.await {
                Ok(Ok(Some(path))) => match executor
                    .spawn(async move { save_archive(&client, &route, &session, &path) })
                    .await
                {
                    Ok(()) => Some(("Conversation archive saved.".into(), false)),
                    Err(error) => Some((format!("Export failed. {error}"), true)),
                },
                Ok(Ok(None)) => None,
                _ => Some(("The archive save dialog was unavailable.".into(), true)),
            };
            let _ = this.update(cx, |this, cx| this.finish_transfer(feedback, cx));
        })
        .detach();
    }

    fn begin_transfer(&mut self, message: &str, cx: &mut Context<Self>) -> Option<RuntimeClient> {
        if self.transfer.busy {
            return None;
        }
        let client = self.runtime_client()?;
        self.transfer.busy = true;
        self.transfer.feedback = Some((message.to_owned(), false));
        cx.notify();
        Some(client)
    }

    fn finish_transfer(&mut self, feedback: Option<(String, bool)>, cx: &mut Context<Self>) {
        self.transfer.busy = false;
        self.transfer.feedback = feedback;
        cx.notify();
    }
}

fn preview_archive(client: &RuntimeClient, path: &Path) -> Result<(Value, String)> {
    let body = json!({ "archive": read_archive(path)? });
    let response = client.control(ControlMethod::Post, "/sessions/import/preview", Some(&body))?;
    let preview = response
        .get("preview")
        .context("The runtime did not return an archive preview.")?;
    let title = preview
        .get("title")
        .and_then(Value::as_str)
        .map(safe_description)
        .filter(|title| !title.is_empty())
        .unwrap_or_else(|| "Untitled conversation".into());
    let messages = preview
        .get("messageCount")
        .and_then(Value::as_u64)
        .context("The runtime did not confirm the message count.")?;
    let attachments = preview
        .get("attachmentCount")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let mut details = format!("{title}\n{messages} messages");
    if attachments > 0 {
        details.push_str(&format!(" · {attachments} attachment references"));
    }
    for omission in preview
        .get("omissionNotices")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .take(5)
    {
        details.push('\n');
        details.push_str(&safe_description(omission));
    }
    Ok((body, details))
}

fn import_archive(client: &RuntimeClient, body: &Value) -> Result<(String, Option<String>)> {
    let response = client.control(ControlMethod::Post, "/sessions/import", Some(body))?;
    let session = response
        .pointer("/imported/sessionId")
        .and_then(Value::as_str)
        .filter(|id| valid_session(id))
        .context("The runtime did not identify the imported conversation.")?;
    let title = response
        .pointer("/imported/summary/title")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    Ok((session.to_owned(), title))
}

fn read_archive(path: &Path) -> Result<Value> {
    let selected = symlink_metadata(path).context("The selected archive could not be opened.")?;
    ensure!(
        selected.is_file() && selected.len() <= MAX_ARCHIVE_BYTES as u64,
        "Choose a regular JSON archive of at most 2 MB."
    );
    let file = File::open(path).context("The selected archive could not be opened.")?;
    let opened = file.metadata()?;
    ensure!(
        same_archive_file(&selected, &opened),
        "The archive changed while opening it."
    );
    let mut bytes = Vec::new();
    file.take((MAX_ARCHIVE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)?;
    parse_archive(&bytes)
}

fn same_archive_file(selected: &std::fs::Metadata, opened: &std::fs::Metadata) -> bool {
    if !opened.is_file() || selected.len() != opened.len() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if selected.dev() != opened.dev() || selected.ino() != opened.ino() {
            return false;
        }
    }
    true
}

fn parse_archive(bytes: &[u8]) -> Result<Value> {
    ensure!(
        bytes.len() <= MAX_ARCHIVE_BYTES,
        "The archive exceeds the 2 MB limit."
    );
    let archive: Value =
        serde_json::from_slice(bytes).context("The selected file is not a valid JSON archive.")?;
    check_archive(&archive)?;
    Ok(archive)
}

fn check_archive(archive: &Value) -> Result<()> {
    ensure!(
        archive.get("schema").and_then(Value::as_str) == Some(ARCHIVE_SCHEMA)
            && archive.get("version").and_then(Value::as_u64) == Some(1),
        "Choose a Doolittle conversation archive in version 1 format."
    );
    Ok(())
}

fn valid_session(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|unit| unit.is_ascii_alphanumeric() || matches!(unit, b':' | b'-' | b'_'))
}

fn export_route(id: &str) -> Result<String> {
    ensure!(
        valid_session(id),
        "The selected conversation ID is invalid."
    );
    Ok(format!("/sessions/export?sessionId={id}"))
}

fn save_archive(client: &RuntimeClient, route: &str, session: &str, path: &Path) -> Result<()> {
    let response = client.control(ControlMethod::Get, route, None)?;
    let archive = response
        .get("archive")
        .context("The runtime did not return a conversation archive.")?;
    check_archive(archive)?;
    ensure!(
        archive.pointer("/source/sessionId").and_then(Value::as_str) == Some(session),
        "The runtime returned a different conversation."
    );
    let bytes = serde_json::to_vec(archive)?;
    ensure!(
        bytes.len() <= MAX_ARCHIVE_BYTES,
        "The archive exceeds the 2 MB limit."
    );
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .context("Choose a writable folder and a new filename.")?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    Ok(())
}

fn safe_description(text: &str) -> String {
    text.chars()
        .filter(|unit| !unit.is_control())
        .take(100)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_only_an_exact_conversation_and_validates_archive_format() {
        assert_eq!(
            export_route("agent:room_1").unwrap(),
            "/sessions/export?sessionId=agent:room_1"
        );
        assert!(export_route("agent&sessionId=another").is_err());
        assert!(parse_archive(br#"{"schema":"doolittle.session.archive","version":1}"#).is_ok());
        assert!(parse_archive(br#"{"schema":"doolittle.session.archive","version":2}"#).is_err());
        assert!(parse_archive(br#"["unsupported"]"#).is_err());
        assert!(parse_archive(&vec![b' '; MAX_ARCHIVE_BYTES + 1]).is_err());
    }
}
