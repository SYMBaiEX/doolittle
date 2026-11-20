use std::{
    io::{Read, Write},
    num::NonZeroU16,
    path::Path,
    sync::mpsc,
    time::Duration,
};

use anyhow::Result;
use async_channel::{Sender, bounded};
use gpui::{
    AnyElement, AppContext, ClipboardItem, Context, Entity, ScrollHandle, Subscription, Window,
    div, prelude::*, px,
};
use gpui_component::{
    Disableable, Sizable,
    button::{Button, ButtonVariants},
    input::{Input, InputEvent, InputState},
};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};

use crate::{themes::Palette, workbench::Workbench};

#[derive(Default)]
pub(crate) struct TerminalState {
    output: String,
    status: Option<String>,
    input: Option<Entity<InputState>>,
    input_events: Option<Subscription>,
    process: Option<TerminalHandle>,
    generation: u64,
    scroll: ScrollHandle,
    closing: bool,
}

enum Update {
    Screen(String),
    Status(String),
    Exited(String),
}

struct TerminalHandle {
    input: mpsc::SyncSender<Vec<u8>>,
    stop: mpsc::Sender<()>,
}

impl Drop for TerminalHandle {
    fn drop(&mut self) {
        let _ = self.stop.send(());
    }
}

fn launch(
    workspace: &Path,
    cols: u16,
    updates: Sender<Update>,
    mut command: CommandBuilder,
) -> Result<TerminalHandle> {
    const ROWS: u16 = 24;
    const HISTORY: usize = 192;
    let pty = native_pty_system().openpty(PtySize {
        rows: ROWS,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    command.cwd(workspace);
    command.env("TERM", "xterm-256color");
    command.env_remove("ELIZA_API_TOKEN");
    command.env_remove("DOOLITTLE_DESKTOP_CONTROL_TOKEN");
    let mut reader = pty.master.try_clone_reader()?;
    let mut writer = pty.master.take_writer()?;
    let mut child = pty.slave.spawn_command(command)?;
    drop(pty.slave);
    let (input, pending_input) = mpsc::sync_channel::<Vec<u8>>(32);
    let (stop, stopped) = mpsc::channel();
    let output = updates.clone();
    std::thread::spawn(move || {
        let mut screen = vt100::Parser::new(
            NonZeroU16::new(ROWS).unwrap(),
            NonZeroU16::new(cols).unwrap(),
            HISTORY,
        );
        let mut bytes = [0; 8192];
        while let Ok(length) = reader.read(&mut bytes) {
            if length == 0 {
                break;
            }
            screen.process(&bytes[..length]);
            let screen = screen.screen_mut();
            let mut contents = String::new();
            let mut offset = screen.scrollback_len();
            while offset != 0 {
                screen.set_scrollback(offset);
                let count = offset.min(usize::from(ROWS));
                for row in screen.rows(0, cols).take(count) {
                    contents.push_str(row.trim_end());
                    contents.push('\n');
                }
                offset -= count;
            }
            screen.set_scrollback(0);
            contents.push_str(&screen.contents());
            if output.send_blocking(Update::Screen(contents)).is_err() {
                break;
            }
        }
    });
    let writer_stop = stop.clone();
    std::thread::spawn(move || {
        while let Ok(bytes) = pending_input.recv() {
            if writer.write_all(&bytes).is_err() {
                let _ = writer_stop.send(());
                break;
            }
        }
    });
    std::thread::spawn(move || {
        let mut close_requested = false;
        let mut next_notice = None;
        let exit = loop {
            match child.try_wait() {
                Ok(Some(_)) if close_requested => break "Shell closed".into(),
                Ok(Some(exit)) if exit.success() => break "Shell exited with code 0".into(),
                Ok(Some(exit)) => break format!("Shell ended. {exit}"),
                Ok(None) => {}
                Err(error) => break error.to_string(),
            }
            if close_requested {
                if next_notice.is_some_and(|deadline| std::time::Instant::now() >= deadline) {
                    let _ = updates.try_send(Update::Status(
                        "Waiting for the system to confirm shell exit.".into(),
                    ));
                    next_notice = None;
                }
                std::thread::sleep(Duration::from_millis(50));
            } else if !matches!(
                stopped.recv_timeout(Duration::from_millis(100)),
                Err(mpsc::RecvTimeoutError::Timeout)
            ) {
                close_requested = true;
                next_notice = Some(std::time::Instant::now() + Duration::from_secs(2));
                let _ = child.kill();
            }
        };
        let _master = pty.master;
        let _ = updates.send_blocking(Update::Exited(exit));
    });
    Ok(TerminalHandle { input, stop })
}

fn start(workbench: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let Some(workspace) = workbench.selected_workspace() else {
        workbench.workspace_tools.terminal.status =
            Some("Reopen this workspace to start its shell.".into());
        cx.notify();
        return;
    };
    let cols = (f32::from(window.viewport_size().width) / 8.).clamp(40., 160.) as u16;
    let (tx, rx) = bounded(8);
    let terminal = &mut workbench.workspace_tools.terminal;
    terminal.output.clear();
    terminal.generation += 1;
    let generation = terminal.generation;
    match launch(&workspace, cols, tx, CommandBuilder::new_default_prog()) {
        Ok(process) => terminal.process = Some(process),
        Err(error) => {
            terminal.status = Some(format!("Terminal could not start. {error}"));
            cx.notify();
            return;
        }
    }
    terminal.status = None;
    let input = cx.new(|cx| InputState::new(window, cx).placeholder("Type a command or reply"));
    terminal.input_events = Some(
        cx.subscribe_in(&input, window, |this, _, event, window, cx| {
            if matches!(event, InputEvent::PressEnter { .. }) {
                send_line(this, window, cx);
            }
        }),
    );
    input.update(cx, |input, cx| input.focus(window, cx));
    terminal.input = Some(input);
    cx.spawn(async move |entity, cx| {
        while let Ok(update) = rx.recv().await {
            if entity
                .update(cx, |this, cx| {
                    let terminal = &mut this.workspace_tools.terminal;
                    if terminal.generation != generation {
                        return;
                    }
                    match update {
                        Update::Screen(text) => {
                            let follow = terminal.scroll.max_offset().height
                                + terminal.scroll.offset().y
                                < px(32.);
                            terminal.output = text;
                            if follow {
                                terminal.scroll.scroll_to_bottom();
                            }
                        }
                        Update::Exited(status) => {
                            terminal.process = None;
                            terminal.closing = false;
                            terminal.status = Some(status);
                        }
                        Update::Status(status) => terminal.status = Some(status),
                    }
                    cx.notify();
                })
                .is_err()
            {
                break;
            }
        }
    })
    .detach();
    cx.notify();
}

fn send_line(workbench: &mut Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let terminal = &mut workbench.workspace_tools.terminal;
    let Some((input, process)) = terminal.input.as_ref().zip(terminal.process.as_ref()) else {
        return;
    };
    let text = input.read(cx).value();
    if text.len() > 4096 {
        return;
    }
    if process
        .input
        .try_send(format!("{text}\r").into_bytes())
        .is_ok()
    {
        input.update(cx, |input, cx| input.set_value("", window, cx));
    } else {
        terminal.status = Some("The terminal has not accepted input yet.".into());
        cx.notify();
    }
}

pub(super) fn render(
    workbench: &Workbench,
    colors: Palette,
    _window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let terminal = &workbench.workspace_tools.terminal;
    let running = terminal.process.is_some();
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(5.))
                .px(px(8.))
                .py(px(3.))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .truncate()
                        .text_sm()
                        .text_color(colors.muted)
                        .child(workbench.workspace_title()),
                )
                .when(!terminal.output.is_empty(), |row| {
                    row.child(
                        Button::new("copy-terminal-output")
                            .small()
                            .ghost()
                            .label("Copy output")
                            .on_click(cx.listener(|this, _, _, cx| {
                                cx.write_to_clipboard(ClipboardItem::new_string(
                                    this.workspace_tools.terminal.output.clone(),
                                ))
                            })),
                    )
                })
                .when(!running, |row| {
                    row.child(
                        Button::new("start-workspace-terminal")
                            .small()
                            .outline()
                            .label("Start shell")
                            .disabled(!workbench.ready() || terminal.closing)
                            .on_click(cx.listener(|this, _, window, cx| start(this, window, cx))),
                    )
                })
                .when(running, |row| {
                    row.child(
                        Button::new("interrupt-terminal")
                            .small()
                            .ghost()
                            .label("Interrupt")
                            .on_click(cx.listener(|this, _, _, _| {
                                if let Some(process) = &this.workspace_tools.terminal.process {
                                    let _ = process.input.try_send(vec![3]);
                                }
                            })),
                    )
                    .child(
                        Button::new("close-terminal-shell")
                            .small()
                            .ghost()
                            .label("Close shell")
                            .on_click(cx.listener(|this, _, _, cx| {
                                let terminal = &mut this.workspace_tools.terminal;
                                terminal.process = None;
                                terminal.closing = true;
                                terminal.status = Some("Closing shell…".into());
                                cx.notify();
                            })),
                    )
                }),
        )
        .child(
            div()
                .id("terminal-screen")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .track_scroll(&terminal.scroll)
                .bg(colors.inset)
                .p(px(7.))
                .font_family(if cfg!(target_os = "macos") {
                    "Menlo"
                } else {
                    "monospace"
                })
                .children(
                    terminal
                        .output
                        .lines()
                        .map(|line| div().text_sm().whitespace_nowrap().child(line.to_owned())),
                ),
        )
        .when_some(terminal.status.as_ref(), |panel, status| {
            panel.child(div().text_xs().px(px(7.)).child(status.clone()))
        })
        .when_some(
            terminal.input.as_ref().filter(|_| running),
            |panel, input| panel.child(Input::new(input).focus_bordered(false)),
        )
        .into_any_element()
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn workspace_shell_reads_input_and_reports_actual_exit() -> Result<()> {
        let (tx, rx) = bounded(8);
        let mut command = CommandBuilder::new("/bin/sh");
        command.args(["-c", "read -r line; [ \"$line\" = 'test input' ] || exit 3; printf 'native-shell-witness\\n'; pwd"]);
        let workspace = Path::new(env!("CARGO_MANIFEST_DIR")).canonicalize()?;
        let process = launch(&workspace, 120, tx, command)?;
        process.input.send(b"test input\r".to_vec())?;
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut observed_output = false;
        let mut observed_exit = false;
        while std::time::Instant::now() < deadline && !(observed_output && observed_exit) {
            match rx.try_recv() {
                Ok(Update::Screen(text)) => {
                    observed_output |= text.contains("native-shell-witness")
                        && text.contains(workspace.to_str().unwrap());
                }
                Ok(Update::Exited(status)) => observed_exit = status == "Shell exited with code 0",
                Ok(Update::Status(_)) => {}
                Err(_) => std::thread::sleep(Duration::from_millis(10)),
            }
        }
        assert!(
            observed_output,
            "PTY did not report the expected workspace and command output"
        );
        assert!(observed_exit, "PTY did not observe exit code 0");
        Ok(())
    }

    #[test]
    fn closes_shell_even_when_the_program_does_not_read_input() -> Result<()> {
        let (tx, rx) = bounded(8);
        let mut command = CommandBuilder::new("/bin/sleep");
        command.arg("60");
        let process = launch(Path::new(env!("CARGO_MANIFEST_DIR")), 80, tx, command)?;
        process.input.send(vec![b'x'; 128 * 1024])?;
        std::thread::sleep(Duration::from_millis(25));
        drop(process);
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            match rx.try_recv() {
                Ok(Update::Exited(status)) => {
                    assert_eq!(status, "Shell closed");
                    return Ok(());
                }
                Ok(_) => {}
                Err(_) => std::thread::sleep(Duration::from_millis(10)),
            }
        }
        anyhow::bail!("PTY shutdown was blocked by terminal input")
    }
}
