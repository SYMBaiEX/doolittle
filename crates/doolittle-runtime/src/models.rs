use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Health {
    pub status: Option<String>,
    #[serde(default)]
    pub ok: bool,
    pub version: Option<String>,
}

impl Health {
    pub fn is_ready(&self) -> bool {
        self.ok || matches!(self.status.as_deref(), Some("ok" | "healthy" | "ready"))
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub session_id: String,
    pub title: Option<String>,
    pub project_id: Option<String>,
    pub bot_id: Option<String>,
    pub started_at: Option<String>,
    pub ended_at: Option<String>,
    pub message_count: usize,
    pub preview: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMessage {
    pub id: Option<String>,
    pub session_id: String,
    pub role: String,
    pub text: String,
    pub created_at: String,
    #[serde(default)]
    pub attachments: Vec<MessageAttachment>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAttachment {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub mime_type: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePage {
    pub messages: Vec<SessionMessage>,
    pub has_earlier: bool,
    pub next_offset: usize,
    pub total_messages: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChatRunStart {
    pub run_id: String,
    pub bot_id: String,
    pub response_id: String,
    pub room_id: String,
    pub events_url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RunStatus {
    Thinking,
    Acting,
    Waiting,
    Complete,
    Cancelled,
    Error,
    #[serde(other)]
    Unknown,
}

impl RunStatus {
    pub fn is_terminal(self) -> bool {
        matches!(self, Self::Complete | Self::Cancelled | Self::Error)
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Thinking => "thinking",
            Self::Acting => "acting",
            Self::Waiting => "waiting",
            Self::Complete => "complete",
            Self::Cancelled => "cancelled",
            Self::Error => "error",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunReceipt {
    pub run_id: String,
    pub session_id: String,
    pub room_id: String,
    pub bot_id: Option<String>,
    pub status: RunStatus,
    pub terminal_reason: Option<String>,
    pub status_detail: Option<String>,
    pub error_message: Option<String>,
    pub active_action: Option<String>,
    pub pending_approvals: usize,
    pub local_mutations: Vec<Value>,
    pub started_at: String,
    pub updated_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone)]
pub struct RunEvent {
    pub kind: String,
    pub cursor: Option<u64>,
    pub data: Value,
}

impl RunEvent {
    pub fn delta(&self) -> Option<&str> {
        if self.kind == "response.output_text.delta" {
            self.data.get("delta")?.as_str()
        } else {
            None
        }
    }

    pub fn final_response(&self) -> Option<&str> {
        if self.kind == "response.completed" {
            self.data.get("response")?.as_str()
        } else {
            None
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self.kind.as_str(),
            "response.completed" | "response.cancelled" | "response.failed"
        )
    }
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceEntry {
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub depth: u8,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceTree {
    pub entries: Vec<WorkspaceEntry>,
    pub truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkspaceFile {
    pub path: String,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceSaveOutcome {
    Saved { path: String },
    Conflict { message: String },
}
