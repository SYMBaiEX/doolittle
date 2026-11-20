use std::{
    io::{Read, Write},
    num::NonZeroU16,
    path::Path,
    sync::{Arc, Mutex, mpsc},
    time::Duration,
};

use anyhow::Result;
use async_channel::{Sender, bounded};
use gpui::{
    AnyElement, AppContext, ClipboardItem, Context, Entity, Pixels, ScrollHandle, Size,
    Subscription, Window, canvas, div, font, prelude::*, px,
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
    viewport: Arc<Mutex<PtySize>>,
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
    viewport: Arc<Mutex<PtySize>>,
    updates: Sender<Update>,
    mut command: CommandBuilder,
) -> Result<TerminalHandle> {
    const HISTORY: usize = 192;
    let initial = *viewport.lock().unwrap();
    let pty = native_pty_system().openpty(initial)?;
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
    let applied_size = Arc::new(Mutex::new(initial));
    let screen_viewport = applied_size.clone();
    std::thread::spawn(move || {
        let mut size = initial;
        let mut screen = vt100::Parser::new(
            NonZeroU16::new(size.rows).unwrap(),
            NonZeroU16::new(size.cols).unwrap(),
            HISTORY,
        );
        let mut bytes = [0; 8192];
        while let Ok(length) = reader.read(&mut bytes) {
            if length == 0 {
                break;
            }
            let next = *screen_viewport.lock().unwrap();
            if size != next {
                size = next;
                screen.set_size(
                    NonZeroU16::new(size.rows).unwrap(),
                    NonZeroU16::new(size.cols).unwrap(),
                );
            }
            screen.process(&bytes[..length]);
            let screen = screen.screen_mut();
            let mut contents = String::new();
            let mut offset = screen.scrollback_len();
            while offset != 0 {
                screen.set_scrollback(offset);
                let count = offset.min(usize::from(size.rows));
                for row in screen.rows(0, size.cols).take(count) {
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
        let mut last_requested = initial;
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
            } else {
                let requested = *viewport.lock().unwrap();
                if requested != last_requested {
                    if pty.master.resize(requested).is_ok() {
                        *applied_size.lock().unwrap() = requested;
                    }
                    last_requested = requested;
                }
                if !matches!(
                    stopped.recv_timeout(Duration::from_millis(100)),
                    Err(mpsc::RecvTimeoutError::Timeout)
                ) {
                    close_requested = true;
                    next_notice = Some(std::time::Instant::now() + Duration::from_secs(2));
                    let _ = child.kill();
                }
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
    let (tx, rx) = bounded(8);
    let terminal = &mut workbench.workspace_tools.terminal;
    terminal.output.clear();
    terminal.generation += 1;
    let generation = terminal.generation;
    match launch(
        &workspace,
        terminal.viewport.clone(),
        tx,
        CommandBuilder::new_default_prog(),
    ) {
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
        terminal.status = Some("Command input is limited to 4096 bytes.".into());
        cx.notify();
        return;
    }
    if process
        .input
        .try_send(format!("{text}\r").into_bytes())
        .is_ok()
    {
        input.update(cx, |input, cx| input.set_value("", window, cx));
        terminal.status = None;
        cx.notify();
    } else {
        terminal.status = Some("The terminal has not accepted input yet.".into());
        cx.notify();
    }
}

pub(super) fn focus(workbench: &Workbench, window: &mut Window, cx: &mut Context<Workbench>) {
    let terminal = &workbench.workspace_tools.terminal;
    if let Some(input) = terminal
        .input
        .as_ref()
        .filter(|_| terminal.process.is_some())
    {
        input.update(cx, |input, cx| input.focus(window, cx));
    }
}

fn viewport_size(size: Size<Pixels>, cell_width: Pixels, line_height: Pixels) -> PtySize {
    let columns = (f32::from((size.width - px(16.)).max(px(0.))) / f32::from(cell_width)).floor();
    let rows = (f32::from((size.height - px(12.)).max(px(0.))) / f32::from(line_height)).floor();
    PtySize {
        cols: columns.clamp(18., 240.) as u16,
        rows: rows.clamp(3., 90.) as u16,
        ..PtySize::default()
    }
}

pub(super) fn render(
    workbench: &Workbench,
    colors: Palette,
    window: &mut Window,
    cx: &mut Context<Workbench>,
) -> AnyElement {
    let terminal = &workbench.workspace_tools.terminal;
    let running = terminal.process.is_some();
    let has_output = !terminal.output.is_empty();
    let viewport = terminal.viewport.clone();
    let monospace = if cfg!(target_os = "macos") {
        "Menlo"
    } else {
        "monospace"
    };
    let font_size = px(12.);
    let line_height = px(17.);
    let font_id = window.text_system().resolve_font(&font(monospace));
    let cell_width = window
        .text_system()
        .advance(font_id, font_size, 'M')
        .ok()
        .map(|advance| advance.width)
        .unwrap_or(px(8.))
        .max(px(2.));
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_h_0()
        .min_w_0()
        .child(
            div()
                .flex()
                .flex_wrap()
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
                .when(has_output, |row| {
                    row.child(
                        Button::new("terminal-latest-output")
                            .small()
                            .ghost()
                            .label("Latest")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.workspace_tools.terminal.scroll.scroll_to_bottom();
                                cx.notify();
                            })),
                    )
                    .child(
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
                            .label("Stop shell")
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
                .relative()
                .flex_1()
                .min_h_0()
                .min_w_0()
                .bg(colors.inset)
                .child(
                    canvas(
                        |_, _, _| (),
                        move |bounds, _, _, _| {
                            if let Ok(mut current) = viewport.try_lock() {
                                *current = viewport_size(bounds.size, cell_width, line_height);
                            }
                        },
                    )
                    .absolute()
                    .inset_0(),
                )
                .child(
                    div()
                        .id("terminal-screen")
                        .size_full()
                        .overflow_scroll()
                        .track_scroll(&terminal.scroll)
                        .px(px(8.))
                        .py(px(6.))
                        .font_family(monospace)
                        .text_size(font_size)
                        .line_height(line_height)
                        .when(!running && !has_output && !terminal.closing, |screen| {
                            screen
                                .text_color(colors.muted)
                                .child("Start a shell in this workspace.")
                        })
                        .children(
                            terminal
                                .output
                                .lines()
                                .map(|line| div().whitespace_nowrap().child(line.to_owned())),
                        ),
                ),
        )
        .when_some(terminal.status.as_ref(), |panel, status| {
            panel.child(div().text_xs().px(px(7.)).child(status.clone()))
        })
        .when_some(
            terminal.input.as_ref().filter(|_| running),
            |panel, input| {
                panel.child(
                    div()
                        .px(px(8.))
                        .py(px(6.))
                        .border_t_1()
                        .border_color(colors.divider)
                        .child(Input::new(input).w_full().focus_bordered(false)),
                )
            },
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
        let process = launch(
            &workspace,
            Arc::new(Mutex::new(PtySize {
                cols: 120,
                ..PtySize::default()
            })),
            tx,
            command,
        )?;
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
        let process = launch(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            Arc::new(Mutex::new(PtySize::default())),
            tx,
            command,
        )?;
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

    #[test]
    fn measures_terminal_cells_from_the_dock_viewport() {
        use gpui::size;

        let compact = viewport_size(size(px(0.), px(0.)), px(8.), px(17.));
        assert_eq!((compact.cols, compact.rows), (18, 3));
        let normal = viewport_size(size(px(656.), px(420.)), px(8.), px(17.));
        assert_eq!((normal.cols, normal.rows), (80, 24));
        let wide = viewport_size(size(px(4000.), px(2000.)), px(8.), px(17.));
        assert_eq!((wide.cols, wide.rows), (240, 90));
    }

    #[test]
    fn running_shell_receives_the_resized_viewport() -> Result<()> {
        let viewport = Arc::new(Mutex::new(PtySize::default()));
        let (tx, rx) = bounded(8);
        let mut command = CommandBuilder::new("/bin/sh");
        command.args([
            "-c",
            r#"while [ "$(stty size)" != "16 60" ]; do sleep 0.05; done; printf 'dock-resize-observed\n'"#,
        ]);
        let process = launch(
            Path::new(env!("CARGO_MANIFEST_DIR")),
            viewport.clone(),
            tx,
            command,
        )?;
        *viewport.lock().unwrap() = PtySize {
            rows: 16,
            cols: 60,
            ..PtySize::default()
        };
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while std::time::Instant::now() < deadline {
            if let Ok(Update::Screen(text)) = rx.try_recv()
                && text.contains("dock-resize-observed")
            {
                drop(process);
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(10));
        }
        anyhow::bail!("shell did not observe the resized dock")
    }
}
