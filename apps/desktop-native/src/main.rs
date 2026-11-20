mod connections;
mod control_plane;
mod markdown_text;
mod navigation;
mod operations;
mod pane_store;
mod panes;
mod session_transfer;
mod themes;
mod ui;
mod updater;
mod workbench;
mod workspace_tools;

use std::path::PathBuf;

use anyhow::{Context as _, Result, bail};
use gpui::{
    App, AppContext, Application, Bounds, KeyBinding, Menu, MenuItem, WindowBounds, WindowId,
    WindowOptions, actions, px, size,
};
use gpui_component::Root;

use workbench::{
    AgentView, IdeView, NewConversation, OpenNavigation, OpenSettings, OpenWorkspace, SaveFile,
    ToggleSidebar, Workbench,
};

actions!(doolittle, [QuitDoolittle]);

#[derive(Clone)]
struct Options {
    workspace: Option<PathBuf>,
    profile: Option<PathBuf>,
    runtime_root: Option<PathBuf>,
    offline: bool,
    dev_reload: bool,
}

fn options() -> Result<Option<Options>> {
    let mut options = Options {
        workspace: None,
        profile: None,
        runtime_root: None,
        offline: false,
        dev_reload: false,
    };
    let mut args = std::env::args_os().skip(1);
    while let Some(argument) = args.next() {
        let flag = argument.to_str().context("invalid command-line option")?;
        let path = |args: &mut std::iter::Skip<std::env::ArgsOs>| {
            args.next()
                .map(PathBuf::from)
                .with_context(|| format!("{flag} requires a path"))
        };
        match flag {
            "--workspace" => options.workspace = Some(path(&mut args)?),
            "--profile" => options.profile = Some(path(&mut args)?),
            "--runtime-root" => options.runtime_root = Some(path(&mut args)?),
            "--offline" => options.offline = true,
            "--dev-reload" if cfg!(debug_assertions) => options.dev_reload = true,
            "--help" | "-h" => {
                println!(
                    "Usage: doolittle-desktop [--workspace PATH] [--profile PATH] \
                     [--runtime-root PATH] [--offline]"
                );
                return Ok(None);
            }
            _ => bail!("unknown option {flag}"),
        }
    }
    Ok(Some(options))
}

fn open_workbench(options: Options, cx: &mut App) -> Result<()> {
    let window_bounds = Bounds::centered(None, size(px(1180.), px(820.)), cx);
    cx.open_window(
        WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(window_bounds)),
            window_min_size: Some(size(px(520.), px(420.))),
            ..WindowOptions::default()
        },
        move |window, cx| {
            let title = options
                .workspace
                .as_ref()
                .and_then(|path| path.file_name())
                .map(|name| format!("Doolittle — {}", name.to_string_lossy()))
                .unwrap_or_else(|| "Doolittle".to_owned());
            window.set_window_title(&title);
            themes::observe_window(window, cx);
            let view = cx.new(|cx| Workbench::new(options, window, cx));
            let workbench = view.downgrade();
            window.on_window_should_close(cx, move |window, cx| {
                workbench
                    .update(cx, |view, cx| view.confirm_close(window, cx))
                    .unwrap_or(true)
            });
            cx.new(|cx| Root::new(view, window, cx))
        },
    )?;
    Ok(())
}

fn activate_workbench(path: &std::path::Path, current: WindowId, cx: &mut App) -> bool {
    cx.windows()
        .into_iter()
        .filter(|handle| handle.window_id() != current)
        .filter_map(|handle| handle.downcast::<Root>())
        .any(|handle| {
            handle
                .update(cx, |root, window, cx| {
                    let Ok(view) = root.view().clone().downcast::<Workbench>() else {
                        return false;
                    };
                    let matches = view
                        .read(cx)
                        .requested_workspace()
                        .and_then(|path| path.canonicalize().ok())
                        .is_some_and(|existing| existing == path);
                    if matches {
                        window.activate_window();
                    }
                    matches
                })
                .unwrap_or(false)
        })
}

fn request_quit(cx: &mut App) {
    for handle in cx
        .windows()
        .into_iter()
        .filter_map(|handle| handle.downcast::<Root>())
    {
        let protected = handle.update(cx, |root, window, cx| {
            let Ok(workbench) = root.view().clone().downcast::<Workbench>() else {
                return false;
            };
            if !workbench.read(cx).has_file_protection(cx) {
                return false;
            }
            window.activate_window();
            workbench.update(cx, |view, cx| {
                view.after_close_confirmation(window, cx, |_, window, cx| {
                    window.remove_window();
                    cx.defer(request_quit);
                });
            });
            true
        });
        if matches!(protected, Ok(true)) {
            return;
        }
    }
    updater::quit(cx);
}

fn start_dev_control(cx: &App) {
    use std::io::Read as _;

    let (send, receive) = async_channel::bounded(1);
    std::thread::spawn(move || {
        for byte in std::io::stdin().lock().bytes() {
            match byte {
                Ok(b'Q') => {
                    let _ = send.try_send(());
                }
                _ => break,
            }
        }
    });
    cx.spawn(async move |cx| {
        while receive.recv().await.is_ok() {
            if cx.update(try_dev_quit).unwrap_or(true) {
                break;
            }
        }
    })
    .detach();
}

fn try_dev_quit(cx: &mut App) -> bool {
    fn pending(view: &Workbench, cx: &App) -> bool {
        view.has_file_protection(cx)
            || view.choosing_workspace
            || view.connecting
            || !view.composer.read(cx).value().is_empty()
            || view.active.values().any(|conversation| {
                !conversation.draft.is_empty()
                    || !conversation.draft_attachments.is_empty()
                    || conversation.choosing_attachments
                    || conversation
                        .active_run
                        .as_ref()
                        .is_some_and(|run| !run.interrupted)
            })
    }

    let busy = cx
        .windows()
        .into_iter()
        .filter_map(|handle| handle.downcast::<Root>())
        .any(|handle| {
            handle
                .update(cx, |root, _, cx| {
                    let Ok(view) = root.view().clone().downcast::<Workbench>() else {
                        return false;
                    };
                    let view = view.read(cx);
                    pending(view, cx)
                        || view
                            .pane_entities
                            .values()
                            .any(|pane| pending(pane.read(cx), cx))
                })
                .unwrap_or(false)
        });
    if !busy {
        request_quit(cx);
    }
    !busy
}

fn main() -> Result<()> {
    let Some(options) = options()? else {
        return Ok(());
    };
    Application::new()
        .with_assets(themes::ThemeAssets)
        .run(move |cx: &mut App| {
            gpui_component::init(cx);
            themes::initialize(cx);
            updater::initialize(cx, request_quit);
            Workbench::bind_keys(cx);
            navigation::bind_keys(cx);
            cx.on_action(|_: &QuitDoolittle, cx| cx.defer(request_quit));
            let quit_key = if cfg!(target_os = "macos") {
                "cmd-q"
            } else {
                "ctrl-q"
            };
            cx.bind_keys([KeyBinding::new(quit_key, QuitDoolittle, None)]);
            cx.set_menus(vec![
                Menu {
                    name: "Doolittle".into(),
                    items: vec![
                        MenuItem::action("Settings…", OpenSettings),
                        MenuItem::action("Quit Doolittle", QuitDoolittle),
                    ],
                },
                Menu {
                    name: "File".into(),
                    items: vec![
                        MenuItem::action("New Chat", NewConversation),
                        MenuItem::action("Open Folder…", OpenWorkspace),
                        MenuItem::action("Save File", SaveFile),
                    ],
                },
                Menu {
                    name: "View".into(),
                    items: vec![
                        MenuItem::action("Agent", AgentView),
                        MenuItem::action("IDE", IdeView),
                        MenuItem::action("Toggle Sidebar", ToggleSidebar),
                        MenuItem::action("Go to…", OpenNavigation),
                    ],
                },
            ]);
            let dev_reload = options.dev_reload;
            match open_workbench(options, cx) {
                Ok(()) => {
                    cx.on_window_closed(|cx| {
                        if cx.windows().is_empty() {
                            updater::quit(cx);
                        }
                    })
                    .detach();
                    if dev_reload {
                        start_dev_control(cx);
                    }
                    cx.activate(true);
                }
                Err(error) => {
                    eprintln!("Could not open Doolittle: {error}");
                    cx.quit();
                }
            }
        });
    Ok(())
}
