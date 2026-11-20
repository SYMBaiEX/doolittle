use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const SESSION: &str = "23d36cd1-20d2-4820-bb1a-153aacc9aab1";
const TOKEN: &str = "fixture-doolittle-token";

struct Request {
    line: String,
    body: Value,
}

fn request(socket: &TcpStream) -> Request {
    socket
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut reader = BufReader::new(socket);
    let mut first = String::new();
    reader.read_line(&mut first).unwrap();
    let mut content_length = 0;
    let mut authorized = false;
    loop {
        let mut header = String::new();
        assert!(reader.read_line(&mut header).unwrap() > 0);
        if header == "\r\n" {
            break;
        }
        let (name, value) = header.trim().split_once(':').unwrap();
        if name.eq_ignore_ascii_case("authorization") {
            authorized = value.trim() == format!("Bearer {TOKEN}");
        }
        if name.eq_ignore_ascii_case("content-length") {
            content_length = value.trim().parse().unwrap();
        }
    }
    assert!(authorized, "CLI omitted its runtime token");
    let mut body = vec![0; content_length];
    reader.read_exact(&mut body).unwrap();
    Request {
        line: first.trim().into(),
        body: if body.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&body).unwrap()
        },
    }
}

fn respond(mut socket: TcpStream, status: &str, content_type: &str, body: &str) {
    write!(
        socket,
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len(),
    )
    .unwrap();
}

fn accept(listener: &TcpListener) -> TcpStream {
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match listener.accept() {
            Ok((socket, _)) => {
                socket.set_nonblocking(false).unwrap();
                return socket;
            }
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                assert!(Instant::now() < deadline, "CLI did not contact its fixture");
                thread::sleep(Duration::from_millis(10));
            }
            Err(error) => panic!("Fixture could not accept the CLI connection: {error}"),
        }
    }
}

fn attached_cli(endpoint: &str) -> Command {
    let mut command = Command::new(env!("CARGO_BIN_EXE_doolittle-native"));
    command
        .args(["--url", endpoint])
        .env("ELIZA_API_TOKEN", TOKEN);
    command
}

#[test]
fn named_agent_commands_stay_on_the_selected_loopback_scope() {
    const BOT: &str = "877aaf43-8995-4b0f-b53a-bfe6f479744f";
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let submit = accept(&listener);
        let input = request(&submit);
        assert_eq!(input.line, format!("POST /bots/{BOT}/chat/runs HTTP/1.1"));
        assert_eq!(input.body["roomId"], SESSION);
        let run = input.body["runId"].as_str().unwrap();
        respond(
            submit,
            "202 Accepted",
            "application/json",
            &json!({
                "run_id": run, "bot_id": BOT, "response_id": "named-response", "room_id": SESSION,
                "events_url": format!("/chat/runs/{run}/events"),
            })
            .to_string(),
        );
        let events = accept(&listener);
        assert_eq!(
            request(&events).line,
            format!("GET /bots/{BOT}/chat/runs/{run}/events?after=0 HTTP/1.1")
        );
        respond(
            events,
            "200 OK",
            "text/event-stream",
            "event: response.completed\ndata: {\"event_id\":1,\"response\":\"Named reply\"}\n\n",
        );
        let history = accept(&listener);
        assert_eq!(
            request(&history).line,
            format!(
                "GET /bots/{BOT}/sessions/messages?sessionId={SESSION}&limit=20&offset=0 HTTP/1.1"
            )
        );
        respond(history, "200 OK", "application/json", &json!({
            "messages": [{"sessionId": SESSION, "role": "assistant", "text": "Named reply", "createdAt": "2026-11-20T00:00:00Z"}],
            "hasEarlier": false, "nextOffset": 0, "totalMessages": 1,
        }).to_string());
        let receipt = accept(&listener);
        assert_eq!(
            request(&receipt).line,
            format!("GET /bots/{BOT}/chat/runs/{run} HTTP/1.1")
        );
        let run_record = json!({
            "runId": run, "sessionId": SESSION, "roomId": SESSION, "botId": BOT, "status": "complete",
            "pendingApprovals": 0, "localMutations": [], "startedAt": "2026-11-20T00:00:00Z", "updatedAt": "2026-11-20T00:00:00Z",
        });
        respond(
            receipt,
            "200 OK",
            "application/json",
            &json!({"run": run_record}).to_string(),
        );
        let cancel = accept(&listener);
        assert_eq!(
            request(&cancel).line,
            format!("POST /bots/{BOT}/chat/runs/{run}/cancel HTTP/1.1")
        );
        respond(
            cancel,
            "200 OK",
            "application/json",
            &json!({"accepted": true, "run": run_record}).to_string(),
        );
    });

    let result = attached_cli(&endpoint)
        .args([
            "--bot",
            BOT,
            "exec",
            "--session",
            SESSION,
            "--json",
            "Test prompt",
        ])
        .output()
        .unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let result: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(result["text"], "Named reply");
    let run = result["runId"].as_str().unwrap();

    let history = attached_cli(&endpoint)
        .args(["history", "--bot", BOT, "--session", SESSION])
        .output()
        .unwrap();
    assert!(
        history.status.success(),
        "{}",
        String::from_utf8_lossy(&history.stderr)
    );
    assert_eq!(
        String::from_utf8_lossy(&history.stdout),
        "Doolittle › Named reply\n"
    );
    for command in ["receipt", "cancel"] {
        let out = attached_cli(&endpoint)
            .args([command, run, "--bot", BOT])
            .output()
            .unwrap();
        assert!(
            out.status.success(),
            "{}",
            String::from_utf8_lossy(&out.stderr)
        );
        assert!(String::from_utf8_lossy(&out.stdout).contains(run));
    }
    server.join().unwrap();
}

#[test]
fn piped_prompt_resumes_event_stream_without_repeating_submission() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let submit = accept(&listener);
        let input = request(&submit);
        assert_eq!(input.line, "POST /chat/runs HTTP/1.1");
        assert_eq!(input.body["roomId"], SESSION);
        assert_eq!(input.body["message"], "Review\nthis project");
        let run_id = input.body["runId"].as_str().unwrap();
        respond(
            submit,
            "202 Accepted",
            "application/json",
            &json!({
                "run_id": run_id,
                "bot_id": "default",
                "response_id": "response",
                "room_id": SESSION,
                "events_url": format!("/chat/runs/{run_id}/events")
            })
            .to_string(),
        );

        let first_events = accept(&listener);
        assert_eq!(
            request(&first_events).line,
            format!("GET /chat/runs/{run_id}/events?after=0 HTTP/1.1")
        );
        respond(
            first_events,
            "200 OK",
            "text/event-stream",
            "event: response.output_text.delta\ndata: {\"event_id\":1,\"delta\":\"Review\"}\n\n",
        );

        let resumed = accept(&listener);
        assert_eq!(
            request(&resumed).line,
            format!("GET /chat/runs/{run_id}/events?after=1 HTTP/1.1")
        );
        respond(
            resumed,
            "200 OK",
            "text/event-stream",
            concat!(
                "event: response.output_text.delta\ndata: {\"event_id\":1,\"delta\":\"Review\"}\n\n",
                "event: response.completed\ndata: {\"event_id\":2,\"response\":\"Review complete\"}\n\n",
            ),
        );
        run_id.to_owned()
    });

    let mut cli = attached_cli(&endpoint)
        .args(["run", "--json", "--stdin", "--session", SESSION])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    cli.stdin
        .take()
        .unwrap()
        .write_all(b"Review\nthis project")
        .unwrap();
    let output = cli.wait_with_output().unwrap();
    let run_id = server.join().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        result,
        json!({"runId": run_id, "sessionId": SESSION, "status": "complete", "text": "Review complete"})
    );
}

#[test]
fn exec_alias_streams_a_result_and_one_event_per_cursor() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let submit = accept(&listener);
        let input = request(&submit);
        assert_eq!(input.line, "POST /chat/runs HTTP/1.1");
        assert_eq!(input.body["roomId"], SESSION);
        assert_eq!(input.body["message"], "Explain the fixture");
        let run = input.body["runId"].as_str().unwrap();
        respond(submit, "202 Accepted", "application/json", &json!({
            "run_id": run, "bot_id": "default", "response_id": "fixture-response", "room_id": SESSION,
            "events_url": format!("/chat/runs/{run}/events")
        }).to_string());
        let events = accept(&listener);
        assert!(request(&events).line.contains("/events?after=0"));
        respond(
            events,
            "200 OK",
            "text/event-stream",
            concat!(
                "event: response.output_text.delta\ndata: {\"event_id\":1,\"delta\":\"Fixture\"}\n\n",
                "event: response.completed\ndata: {\"event_id\":2,\"response\":\"Fixture explained\"}\n\n"
            ),
        );
    });
    let result = attached_cli(&endpoint)
        .args([
            "exec",
            "--json-stream",
            "--session-id",
            SESSION,
            "-p",
            "Explain the fixture",
        ])
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let stdout = String::from_utf8(result.stdout).unwrap();
    let output = stdout
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(output.len(), 4);
    assert_eq!(output[0]["type"], "start");
    assert_eq!(output[1]["cursor"], 1);
    assert_eq!(output[2]["cursor"], 2);
    assert_eq!(output[3]["outcome"]["text"], "Fixture explained");
    assert_eq!(output[3]["outcome"]["runId"], output[0]["runId"]);
}

#[test]
fn operator_approval_is_an_exact_authenticated_request() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let decide = accept(&listener);
        assert_eq!(
            request(&decide).line,
            "POST /execution/approvals/approval-12/deny HTTP/1.1"
        );
        respond(
            decide,
            "200 OK",
            "application/json",
            r#"{"approval":{"id":"approval-12","status":"denied"}}"#,
        );
    });
    let result = attached_cli(&endpoint)
        .args(["approval", "--json", "deny", "approval-12"])
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let value: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(value["approval"]["status"], "denied");
}

#[test]
fn codex_sign_in_uses_the_provider_flow_and_reports_only_account_metadata() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let start = accept(&listener);
        let input = request(&start);
        assert_eq!(input.line, "POST /accounts/oauth/start HTTP/1.1");
        assert_eq!(input.body, json!({"provider": "codex"}));
        respond(
            start,
            "200 OK",
            "application/json",
            &json!({"flow": {
                "id": SESSION, "status": "pending", "needsCodeSubmission": false,
                "authUrl": "https://auth.openai.com/oauth/authorize?state=fixture"
            }})
            .to_string(),
        );
        let status = accept(&listener);
        assert_eq!(
            request(&status).line,
            format!("GET /accounts/oauth/status?flowId={SESSION} HTTP/1.1")
        );
        respond(status, "200 OK", "application/json", &json!({"flow": {
            "id": SESSION, "status": "success", "account": {"id": "codex-fixture", "label": "Codex"}
        }}).to_string());
    });
    let result = attached_cli(&endpoint)
        .args(["accounts", "connect", "codex", "--json"])
        .output()
        .unwrap();
    server.join().unwrap();
    assert!(
        result.status.success(),
        "{}",
        String::from_utf8_lossy(&result.stderr)
    );
    let payload: Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(payload["account"]["id"], "codex-fixture");
    assert!(!String::from_utf8_lossy(&result.stdout).contains("fixture&"));
    assert!(
        String::from_utf8_lossy(&result.stderr)
            .contains("https://auth.openai.com/oauth/authorize?state=fixture")
    );
}

#[test]
fn provider_key_is_rejected_in_noninteractive_terminal_input() {
    let mut child = attached_cli("http://127.0.0.1:49158")
        .args([
            "accounts",
            "add-key",
            "openai-api",
            "--id",
            "fixture",
            "--label",
            "Fixture",
        ])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let _ = child.stdin.take().unwrap().write_all(b"synthetic-secret\n");
    let result = child.wait_with_output().unwrap();
    assert!(!result.status.success());
    assert!(result.stdout.is_empty());
    let error = String::from_utf8_lossy(&result.stderr);
    assert!(error.contains("requires an interactive terminal"));
    assert!(!error.contains("synthetic-secret"));
}

#[cfg(unix)]
#[test]
fn ctrl_c_requests_cancellation_of_the_active_run() {
    use std::sync::mpsc;
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let (watching, active) = mpsc::channel();
    let server = thread::spawn(move || {
        let submit = accept(&listener);
        let input = request(&submit);
        assert_eq!(input.line, "POST /chat/runs HTTP/1.1");
        let run_id = input.body["runId"].as_str().unwrap();
        respond(
            submit,
            "202 Accepted",
            "application/json",
            &json!({
                "run_id": run_id,
                "bot_id": "default",
                "response_id": "response",
                "room_id": SESSION,
                "events_url": format!("/chat/runs/{run_id}/events")
            })
            .to_string(),
        );

        let mut stream = accept(&listener);
        assert_eq!(
            request(&stream).line,
            format!("GET /chat/runs/{run_id}/events?after=0 HTTP/1.1")
        );
        stream
            .write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n",
            )
            .unwrap();
        watching.send(()).unwrap();

        let cancel = accept(&listener);
        assert_eq!(
            request(&cancel).line,
            format!("POST /chat/runs/{run_id}/cancel HTTP/1.1")
        );
        respond(
            cancel,
            "200 OK",
            "application/json",
            &json!({
                "accepted": true,
                "run": {
                    "runId": run_id,
                    "sessionId": SESSION,
                    "roomId": SESSION,
                    "status": "waiting",
                    "pendingApprovals": 0,
                    "localMutations": [],
                    "startedAt": "2026-11-20T00:00:00Z",
                    "updatedAt": "2026-11-20T00:00:00Z",
                }
            })
            .to_string(),
        );
        stream
            .write_all(b"event: response.cancelled\ndata: {\"event_id\":1}\n\n")
            .unwrap();
        run_id.to_owned()
    });

    let cli = attached_cli(&endpoint)
        .args(["run", "--json", "--session", SESSION, "Long-running review"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    active.recv_timeout(Duration::from_secs(8)).unwrap();
    let interrupt = Command::new("kill")
        .args(["-INT", &cli.id().to_string()])
        .status()
        .unwrap();
    assert!(interrupt.success());
    let output = cli.wait_with_output().unwrap();
    let run_id = server.join().unwrap();
    assert_eq!(output.status.code(), Some(130));
    let result: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        result,
        json!({"runId": run_id, "sessionId": SESSION, "status": "cancelled", "text": ""})
    );
}
