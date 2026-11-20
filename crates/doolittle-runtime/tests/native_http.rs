use doolittle_runtime::{RunStatus, RuntimeClient, RuntimeError};
use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    thread::{self, JoinHandle},
    time::Duration,
};

struct Request {
    method: String,
    target: String,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Request {
    fn header(&self, name: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(field, _)| field == name)
            .map(|(_, value)| value.as_str())
    }
}

struct Reply {
    status: u16,
    content_type: &'static str,
    headers: Vec<(String, String)>,
    body: Vec<u8>,
}

impl Reply {
    fn json(status: u16, value: Value) -> Self {
        Self {
            status,
            content_type: "application/json",
            headers: Vec::new(),
            body: value.to_string().into_bytes(),
        }
    }
}

fn read_request(stream: &TcpStream) -> Request {
    let mut reader = BufReader::new(stream);
    let mut first = String::new();
    reader.read_line(&mut first).unwrap();
    let mut request_line = first.split_ascii_whitespace();
    let method = request_line.next().unwrap().to_string();
    let target = request_line.next().unwrap().to_string();
    let mut headers = Vec::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).unwrap();
        if line == "\r\n" {
            break;
        }
        let (name, value) = line
            .split_once(':')
            .expect("malformed fixture request header");
        headers.push((name.to_ascii_lowercase(), value.trim().to_string()));
    }
    let mut request = Request {
        method,
        target,
        headers,
        body: Vec::new(),
    };
    let size = request
        .header("content-length")
        .unwrap_or("0")
        .parse()
        .unwrap();
    request.body.resize(size, 0);
    reader.read_exact(&mut request.body).unwrap();
    request
}

fn serve(
    count: usize,
    mut on_request: impl FnMut(Request) -> Reply + Send + 'static,
) -> (RuntimeClient, JoinHandle<()>) {
    let listener = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    listener.set_nonblocking(true).unwrap();
    let address = listener.local_addr().unwrap();
    let thread = thread::spawn(move || {
        for _ in 0..count {
            let deadline = std::time::Instant::now() + Duration::from_secs(5);
            let mut stream = loop {
                match listener.accept() {
                    Ok((stream, _)) => break stream,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        assert!(
                            std::time::Instant::now() < deadline,
                            "fixture request timed out"
                        );
                        thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("fixture request error: {error}"),
                }
            };
            stream.set_nonblocking(false).unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(3)))
                .unwrap();
            let request = read_request(&stream);
            assert_eq!(
                request.header("authorization"),
                Some("Bearer fixture-token")
            );
            let reply = on_request(request);
            write!(
                stream,
                "HTTP/1.1 {} Fixture\r\nConnection: close\r\nContent-Type: {}\r\nContent-Length: {}\r\n",
                reply.status,
                reply.content_type,
                reply.body.len()
            ).unwrap();
            for (key, value) in reply.headers {
                write!(stream, "{key}: {value}\r\n").unwrap();
            }
            write!(stream, "\r\n").unwrap();
            stream.write_all(&reply.body).unwrap();
        }
    });
    let client = RuntimeClient::new(&format!("http://{address}"), "fixture-token").unwrap();
    (client, thread)
}

#[test]
fn does_not_return_messages_from_a_different_conversation() {
    let (client, server) = serve(1, |request| {
        assert_eq!(
            request.target,
            "/sessions/messages?sessionId=mine&limit=20&offset=0"
        );
        Reply::json(
            200,
            json!({
                "messages": [{"sessionId":"other","role":"assistant","text":"unrelated","createdAt":"2026-11-20"}],
                "hasEarlier": false,
                "nextOffset": 1,
                "totalMessages": 1
            }),
        )
    });
    assert!(matches!(
        client.messages("mine", 20, 0),
        Err(RuntimeError::ResponseMismatch)
    ));
    server.join().unwrap();
}

#[test]
fn submits_and_streams_the_canonical_run_contract() {
    let (client, server) = serve(3, |request| match request.target.as_str() {
        "/health" => {
            assert_eq!(request.method, "GET");
            Reply::json(200, json!({"status": "ok"}))
        }
        "/chat/runs" => {
            assert_eq!(request.method, "POST");
            assert_eq!(
                request.header("x-doolittle-origin-conversation"),
                Some("native:demo")
            );
            let body: Value = serde_json::from_slice(&request.body).unwrap();
            assert_eq!(
                body,
                json!({
                    "message": "hello", "roomId": "native:demo", "runId": "run-1",
                    "source": "native"
                })
            );
            Reply::json(
                202,
                json!({
                    "run_id": "run-1", "bot_id": "default", "response_id": "response-1",
                    "room_id": "native:demo", "events_url": "/chat/runs/run-1/events"
                }),
            )
        }
        "/chat/runs/run-1/events?after=2" => {
            assert_eq!(request.method, "GET");
            assert_eq!(request.header("accept"), Some("text/event-stream"));
            Reply {
                status: 200,
                content_type: "text/event-stream; charset=utf-8",
                headers: Vec::new(),
                body: concat!(
                    "event: response.output_text.delta\ndata: {\"delta\":\"hello\",\"event_id\":3}\n\n",
                    "event: response.completed\ndata: {\"response\":\"hello\",\"event_id\":4}\n\n",
                ).as_bytes().to_vec(),
            }
        }
        unexpected => panic!("unexpected request {unexpected}"),
    });

    assert!(client.health().unwrap().is_ready());
    let run = client
        .start_chat_with_id("native:demo", "hello", "run-1")
        .unwrap();
    assert_eq!(run.run_id, "run-1");
    let mut fragments = Vec::new();
    let cursor = client
        .stream_run(&run.run_id, 2, |event| {
            if let Some(text) = event.delta() {
                fragments.push(text.to_string());
            }
            if event.is_terminal() {
                assert_eq!(event.final_response(), Some("hello"));
            }
            true
        })
        .unwrap();
    assert_eq!(fragments, ["hello"]);
    assert_eq!(cursor, 4);
    server.join().unwrap();
}

#[test]
fn encodes_file_and_conversation_identity_and_reports_cancellation_receipt() {
    let (client, server) = serve(2, |request| match request.target.as_str() {
        "/workspace/read?path=src%2Falpha+%26+beta.rs" => {
            assert_eq!(
                request.header("x-doolittle-origin-conversation"),
                Some("demo")
            );
            Reply::json(
                200,
                json!({"path":"src/alpha & beta.rs","content":"fn main() {}"}),
            )
        }
        "/chat/runs/run-2/cancel" => {
            assert_eq!(request.method, "POST");
            Reply::json(
                200,
                json!({"accepted":true,"run":{
                    "runId":"run-2", "sessionId":"demo", "roomId":"demo",
                    "status":"cancelled", "terminalReason":"cancelled", "pendingApprovals":0,
                    "localMutations":[], "startedAt":"2026-11-20", "updatedAt":"2026-11-20"
                }}),
            )
        }
        unexpected => panic!("unexpected request {unexpected}"),
    });
    let file = client.read_file("demo", "src/alpha & beta.rs").unwrap();
    assert_eq!(file.content, "fn main() {}");
    let run = client.cancel_run("run-2").unwrap();
    assert_eq!(run.status, RunStatus::Cancelled);
    assert!(run.status.is_terminal());
    server.join().unwrap();
}

#[test]
fn protects_loopback_credentials_and_scope() {
    for target in [
        "https://127.0.0.1:54321",
        "http://localhost:54321",
        "http://192.0.2.1:54321",
        "http://person@127.0.0.1:54321",
        "http://127.0.0.1:54321/other",
    ] {
        assert!(matches!(
            RuntimeClient::new(target, "token"),
            Err(RuntimeError::InvalidOrigin)
        ));
    }
    assert!(matches!(
        RuntimeClient::new("http://127.0.0.1:54321", "line\nheader"),
        Err(RuntimeError::InvalidToken)
    ));
    let trap = TcpListener::bind(("127.0.0.1", 0)).unwrap();
    trap.set_nonblocking(true).unwrap();
    let redirected = format!("http://{}/health", trap.local_addr().unwrap());
    let (client, server) = serve(1, move |request| {
        assert_eq!(request.target, "/health");
        let mut response = Reply::json(302, json!({}));
        response
            .headers
            .push(("Location".into(), redirected.clone()));
        response
    });
    for path in ["../secret", "/etc/passwd", "src\\secret", "C:/file"] {
        assert!(matches!(
            client.read_file("demo", path),
            Err(RuntimeError::InvalidInput(_))
        ));
    }
    assert!(matches!(
        client.get_json("//another-origin/status", None),
        Err(RuntimeError::InvalidInput(_))
    ));
    assert_eq!(client.health().unwrap_err().http_status(), Some(302));
    assert!(matches!(trap.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock));
    server.join().unwrap();
}
