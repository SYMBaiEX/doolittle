//! Blocking native client for the existing ElizaOS runtime HTTP contract.
//! GUI applications should run requests off their UI thread.

mod models;
mod stream;

pub use models::*;

use std::{io::Read, time::Duration};

use reqwest::{
    Method,
    blocking::{Client, RequestBuilder, Response},
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, HeaderMap, HeaderValue},
    redirect::Policy,
};
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::Value;
use thiserror::Error;
use url::{Host, Url};
use uuid::Uuid;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);
const STREAM_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_JSON_BYTES: u64 = 8 * 1024 * 1024;
const MAX_ERROR_BYTES: u64 = 16 * 1024;
const MAX_MESSAGE_BYTES: usize = 256 * 1024;
const MAX_EVENT_ID: u64 = (1 << 53) - 1;
const CONVERSATION_HEADER: &str = "x-doolittle-origin-conversation";

pub type Result<T> = std::result::Result<T, RuntimeError>;

#[derive(Debug, Error)]
pub enum RuntimeError {
    #[error("The runtime URL must be a plain HTTP origin on a loopback IP address.")]
    InvalidOrigin,
    #[error("The runtime requires a nonempty bearer token.")]
    InvalidToken,
    #[error("Invalid {0}.")]
    InvalidInput(&'static str),
    #[error("Communication with the Doolittle runtime failed.")]
    Transport(#[source] reqwest::Error),
    #[error("Could not read the runtime response.")]
    Read(#[source] std::io::Error),
    #[error("The runtime returned HTTP {status}: {message}")]
    Http {
        status: u16,
        code: Option<String>,
        message: String,
    },
    #[error("The runtime response exceeded the supported size.")]
    ResponseTooLarge,
    #[error("The runtime returned invalid JSON for this endpoint.")]
    InvalidResponse,
    #[error("The runtime response did not match the requested run or conversation.")]
    ResponseMismatch,
    #[error("The runtime returned an invalid event stream.")]
    InvalidEvent,
    #[error("The event stream disconnected after update {cursor}. The run may still be active.")]
    StreamInterrupted { cursor: u64 },
}

impl RuntimeError {
    pub fn http_status(&self) -> Option<u16> {
        if let Self::Http { status, .. } = self {
            Some(*status)
        } else {
            None
        }
    }
}

#[derive(Clone)]
pub struct RuntimeClient {
    base: Url,
    http: Client,
}

impl RuntimeClient {
    pub fn new(base_url: &str, token: &str) -> Result<Self> {
        let base = Url::parse(base_url).map_err(|_| RuntimeError::InvalidOrigin)?;
        let loopback = match base.host() {
            Some(Host::Ipv4(host)) => host.is_loopback(),
            Some(Host::Ipv6(host)) => host.is_loopback(),
            _ => false,
        };
        if !loopback
            || base.scheme() != "http"
            || !base.username().is_empty()
            || base.password().is_some()
            || base.path() != "/"
            || base.query().is_some()
            || base.fragment().is_some()
        {
            return Err(RuntimeError::InvalidOrigin);
        }
        if token.is_empty()
            || token.len() > 4096
            || !token.bytes().all(|byte| byte.is_ascii_graphic())
        {
            return Err(RuntimeError::InvalidToken);
        }
        let mut authorization = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| RuntimeError::InvalidToken)?;
        authorization.set_sensitive(true);
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, authorization);
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        let http = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(3))
            .timeout(REQUEST_TIMEOUT)
            .default_headers(headers)
            .build()
            .map_err(transport)?;
        Ok(Self { base, http })
    }

    pub fn health(&self) -> Result<Health> {
        decode(
            self.request(Method::GET, "/health", None)?
                .send()
                .map_err(transport)?,
        )
    }

    pub fn sessions(&self, limit: usize) -> Result<Vec<SessionSummary>> {
        let request = self
            .request(Method::GET, "/sessions", None)?
            .query(&[("limit", limit.clamp(1, 200))]);
        let body: SessionsResponse = decode(request.send().map_err(transport)?)?;
        Ok(body.sessions)
    }

    pub fn messages(&self, session_id: &str, limit: usize, offset: usize) -> Result<MessagePage> {
        validate_id("conversation ID", session_id)?;
        let request = self
            .request(Method::GET, "/sessions/messages", Some(session_id))?
            .query(&[("sessionId", session_id)])
            .query(&[
                ("limit", limit.clamp(1, 500)),
                ("offset", offset.min(1_000_000_000)),
            ]);
        let page: MessagePage = decode(request.send().map_err(transport)?)?;
        if page
            .messages
            .iter()
            .any(|message| message.session_id != session_id)
        {
            return Err(RuntimeError::ResponseMismatch);
        }
        Ok(page)
    }

    pub fn start_chat(&self, session_id: &str, message: &str) -> Result<ChatRunStart> {
        self.start_chat_with_id(session_id, message, &Uuid::new_v4().to_string())
    }

    /// Use a caller-chosen run ID to recover a receipt after an uncertain POST.
    /// An error from submission never indicates that retrying with a new ID is safe.
    pub fn start_chat_with_id(
        &self,
        session_id: &str,
        message: &str,
        run_id: &str,
    ) -> Result<ChatRunStart> {
        validate_id("conversation ID", session_id)?;
        validate_id("run ID", run_id)?;
        if message.trim().is_empty() || message.len() > MAX_MESSAGE_BYTES {
            return Err(RuntimeError::InvalidInput("message"));
        }
        let response = self
            .request(Method::POST, "/chat/runs", Some(session_id))?
            .json(&ChatRequest {
                room_id: session_id,
                run_id,
                message,
                source: "native",
            })
            .send()
            .map_err(transport)?;
        let started: ChatRunStart = decode(response)?;
        if started.run_id != run_id || started.room_id != session_id {
            return Err(RuntimeError::ResponseMismatch);
        }
        Ok(started)
    }

    pub fn run(&self, run_id: &str) -> Result<RunReceipt> {
        validate_id("run ID", run_id)?;
        self.run_receipt(Method::GET, &format!("/chat/runs/{run_id}"), run_id)
    }

    pub fn cancel_run(&self, run_id: &str) -> Result<RunReceipt> {
        validate_id("run ID", run_id)?;
        self.run_receipt(Method::POST, &format!("/chat/runs/{run_id}/cancel"), run_id)
    }

    /// Reads a bounded run-event window. Returning false from the callback
    /// detaches the viewer. Cancellation is a separate explicit request.
    ///
    /// A stream can end before the run finishes. Reattach from the reported
    /// cursor or retrieve the authoritative run receipt.
    pub fn stream_run(
        &self,
        run_id: &str,
        after: u64,
        on_event: impl FnMut(RunEvent) -> bool,
    ) -> Result<u64> {
        validate_id("run ID", run_id)?;
        if after > MAX_EVENT_ID {
            return Err(RuntimeError::InvalidInput("event cursor"));
        }
        let response = self
            .request(Method::GET, &format!("/chat/runs/{run_id}/events"), None)?
            .query(&[("after", after)])
            .header(ACCEPT, "text/event-stream")
            .timeout(STREAM_TIMEOUT)
            .send()
            .map_err(|_| RuntimeError::StreamInterrupted { cursor: after })?;
        let response = checked_response(response)?;
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default();
        if !content_type
            .split(';')
            .next()
            .unwrap_or_default()
            .trim()
            .eq_ignore_ascii_case("text/event-stream")
        {
            return Err(RuntimeError::InvalidEvent);
        }
        stream::read_events(response, after, on_event)
    }

    pub fn workspace_tree(&self, session_id: &str, depth: u8) -> Result<WorkspaceTree> {
        let request = self
            .request(Method::GET, "/workspace/tree", Some(session_id))?
            .query(&[("depth", depth.min(12))]);
        decode(request.send().map_err(transport)?)
    }

    pub fn read_file(&self, session_id: &str, path: &str) -> Result<WorkspaceFile> {
        validate_workspace_path(path)?;
        let request = self
            .request(Method::GET, "/workspace/read", Some(session_id))?
            .query(&[("path", path)]);
        let file: WorkspaceFile = decode(request.send().map_err(transport)?)?;
        if file.path != path {
            return Err(RuntimeError::ResponseMismatch);
        }
        Ok(file)
    }

    /// Reads a read-only API resource on the connected loopback instance.
    /// The runtime still owns route admission and workspace authorization.
    pub fn get_json(&self, path: &str, session_id: Option<&str>) -> Result<Value> {
        decode(
            self.request(Method::GET, path, session_id)?
                .send()
                .map_err(transport)?,
        )
    }

    fn run_receipt(&self, method: Method, path: &str, run_id: &str) -> Result<RunReceipt> {
        let cancelling = method == Method::POST;
        let response = self
            .request(method, path, None)?
            .send()
            .map_err(transport)?;
        let result: RunResponse = decode(response)?;
        if result.run.run_id != run_id || (cancelling && result.accepted != Some(true)) {
            return Err(RuntimeError::ResponseMismatch);
        }
        Ok(result.run)
    }

    fn request(
        &self,
        method: Method,
        path: &str,
        session_id: Option<&str>,
    ) -> Result<RequestBuilder> {
        let target = request_url(&self.base, path)?;
        let mut request = self.http.request(method, target);
        if let Some(session_id) = session_id {
            validate_id("conversation ID", session_id)?;
            request = request.header(CONVERSATION_HEADER, session_id);
        }
        Ok(request)
    }
}

#[derive(Deserialize)]
struct SessionsResponse {
    sessions: Vec<SessionSummary>,
}

#[derive(Deserialize)]
struct RunResponse {
    accepted: Option<bool>,
    run: RunReceipt,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatRequest<'a> {
    room_id: &'a str,
    run_id: &'a str,
    message: &'a str,
    source: &'static str,
}

#[derive(Deserialize)]
struct ErrorResponse {
    error: Option<String>,
    code: Option<String>,
}

fn checked_response(response: Response) -> Result<Response> {
    if response.status().is_success() {
        return Ok(response);
    }
    let status = response.status().as_u16();
    let error: Option<ErrorResponse> = bounded_body(response, MAX_ERROR_BYTES)
        .ok()
        .and_then(|body| serde_json::from_slice(&body).ok());
    let (code, message) = error
        .map(|error| (error.code, error.error.map(|text| sanitized_text(&text))))
        .unwrap_or_default();
    Err(RuntimeError::Http {
        status,
        code: code.filter(|value| validate_id("error code", value).is_ok()),
        message: message.unwrap_or_else(|| "request rejected".into()),
    })
}

fn decode<T: DeserializeOwned>(response: Response) -> Result<T> {
    let body = bounded_body(checked_response(response)?, MAX_JSON_BYTES)?;
    serde_json::from_slice(&body).map_err(|_| RuntimeError::InvalidResponse)
}

fn bounded_body(response: Response, limit: u64) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > limit)
    {
        return Err(RuntimeError::ResponseTooLarge);
    }
    let mut bytes = Vec::new();
    response
        .take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(RuntimeError::Read)?;
    if bytes.len() as u64 > limit {
        return Err(RuntimeError::ResponseTooLarge);
    }
    Ok(bytes)
}

fn sanitized_text(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .take(300)
        .collect()
}

fn transport(error: reqwest::Error) -> RuntimeError {
    RuntimeError::Transport(error.without_url())
}

fn request_url(base: &Url, path: &str) -> Result<Url> {
    if path.len() > 8192 || path.chars().any(char::is_control) || path.contains(['#', '\\']) {
        return Err(RuntimeError::InvalidInput("endpoint"));
    }
    let (pathname, query) = path
        .split_once('?')
        .map_or((path, None), |(path, query)| (path, Some(query)));
    let segments = pathname
        .strip_prefix('/')
        .ok_or(RuntimeError::InvalidInput("endpoint"))?;
    if segments.split('/').any(|part| {
        part.is_empty()
            || matches!(part, "." | "..")
            || !part
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_.:".contains(&byte))
    }) {
        return Err(RuntimeError::InvalidInput("endpoint"));
    }
    let mut url = base.clone();
    url.set_path(pathname);
    url.set_query(query);
    Ok(url)
}

fn validate_id(label: &'static str, id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b":_-".contains(&byte))
    {
        return Err(RuntimeError::InvalidInput(label));
    }
    Ok(())
}

fn validate_workspace_path(path: &str) -> Result<()> {
    if path.len() > 4096
        || path.chars().any(char::is_control)
        || path.contains(['\\', ':'])
        || path
            .split('/')
            .any(|part| part.is_empty() || matches!(part, "." | ".."))
    {
        return Err(RuntimeError::InvalidInput("workspace-relative path"));
    }
    Ok(())
}
