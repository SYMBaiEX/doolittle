use std::io::{BufRead, BufReader, Read};

use serde_json::Value;

use crate::{MAX_EVENT_ID, Result, RunEvent, RuntimeError};

const MAX_EVENT_BYTES: usize = 1024 * 1024;

struct Frame {
    kind: String,
    cursor: Option<u64>,
    data: String,
}

impl Frame {
    fn new() -> Self {
        Self {
            kind: "message".into(),
            cursor: None,
            data: String::new(),
        }
    }

    fn take_event(&mut self) -> Result<Option<RunEvent>> {
        let frame = std::mem::replace(self, Self::new());
        if frame.data.is_empty() {
            return Ok(None);
        }
        let data: Value =
            serde_json::from_str(&frame.data).map_err(|_| RuntimeError::InvalidEvent)?;
        let cursor = if let Some(value) = data.get("event_id") {
            let number = value
                .as_u64()
                .filter(|number| *number <= MAX_EVENT_ID)
                .ok_or(RuntimeError::InvalidEvent)?;
            if frame.cursor.is_some_and(|cursor| cursor != number) {
                return Err(RuntimeError::InvalidEvent);
            }
            Some(number)
        } else {
            frame.cursor
        };
        Ok(Some(RunEvent {
            kind: frame.kind,
            cursor,
            data,
        }))
    }
}

pub(crate) fn read_events(
    body: impl Read,
    after: u64,
    mut on_event: impl FnMut(RunEvent) -> bool,
) -> Result<u64> {
    let mut reader = BufReader::new(body);
    let mut cursor = after;
    let mut line = Vec::new();
    let mut frame_size = 0;
    let mut frame = Frame::new();
    loop {
        line.clear();
        // Limit both a single line and one frame. A peer can send a never-ending
        // line, so checking only after read_until would leave memory unbounded.
        let available = (MAX_EVENT_BYTES - frame_size + 1) as u64;
        let read = (&mut reader)
            .take(available)
            .read_until(b'\n', &mut line)
            .map_err(|_| RuntimeError::StreamInterrupted { cursor })?;
        if read == 0 {
            return Err(RuntimeError::StreamInterrupted { cursor });
        }
        frame_size += read;
        if frame_size > MAX_EVENT_BYTES {
            return Err(RuntimeError::ResponseTooLarge);
        }
        let text = std::str::from_utf8(&line).map_err(|_| RuntimeError::InvalidEvent)?;
        let text = text.trim_end_matches(['\r', '\n']);
        if text.is_empty() {
            frame_size = 0;
            let Some(event) = frame.take_event()? else {
                continue;
            };
            if let Some(next) = event.cursor {
                if next <= cursor {
                    continue;
                }
                cursor = next;
            }
            let terminal = event.is_terminal();
            if !on_event(event) || terminal {
                return Ok(cursor);
            }
            continue;
        }
        let (field, value) = text.split_once(':').unwrap_or((text, ""));
        let value = value.strip_prefix(' ').unwrap_or(value);
        match field {
            "event" if !value.is_empty() && value.len() <= 128 => {
                frame.kind = value.to_string();
            }
            "data" => {
                frame.data.push_str(value);
                frame.data.push('\n');
            }
            "id" if !value.is_empty() => {
                frame.cursor = Some(
                    value
                        .parse::<u64>()
                        .ok()
                        .filter(|number| *number <= MAX_EVENT_ID)
                        .ok_or(RuntimeError::InvalidEvent)?,
                );
            }
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_monotonic_cursor_including_across_notices() {
        let input = concat!(
            "event: response.notice\r\ndata: {\"code\":\"replay_gap\"}\r\n\r\n",
            "event: response.output_text.delta\r\ndata: {\"delta\":\"hi\",\r\n",
            "data: \"event_id\":4}\r\n\r\n",
            "event: response.output_text.delta\ndata: {\"delta\":\"again\",\"event_id\":4}\n\n",
            "event: response.completed\ndata: {\"response\":\"hi\",\"event_id\":5}\n\n",
        );
        let mut events = Vec::new();
        let cursor = read_events(input.as_bytes(), 2, |event| {
            events.push(event);
            true
        })
        .unwrap();
        assert_eq!(cursor, 5);
        assert_eq!(events.len(), 3);
        assert_eq!(events[0].cursor, None);
        assert_eq!(events[1].delta(), Some("hi"));
        assert_eq!(events[2].final_response(), Some("hi"));
    }

    #[test]
    fn disconnection_does_not_claim_run_completion() {
        let input = b"event: agent.progress\ndata: {\"event_id\":7}\n\n";
        assert!(matches!(
            read_events(&input[..], 6, |_| true),
            Err(RuntimeError::StreamInterrupted { cursor: 7 })
        ));
    }

    #[test]
    fn rejects_an_unterminated_oversize_frame() {
        let input = std::iter::repeat_n(b'x', MAX_EVENT_BYTES + 1).collect::<Vec<_>>();
        assert!(matches!(
            read_events(&input[..], 0, |_| true),
            Err(RuntimeError::ResponseTooLarge)
        ));
    }
}
