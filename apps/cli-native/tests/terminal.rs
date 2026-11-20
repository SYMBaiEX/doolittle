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
            Ok((socket, _)) => return socket,
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
