mod connections;
mod control_plane;
mod markdown_text;
mod navigation;
mod operations;
mod session_transfer;
mod themes;
mod ui;
mod workbench;
mod workspace_tools;

use std::path::PathBuf;

use anyhow::{Context as _, Result, bail};
use gpui::{
    App, AppContext, Application, Bounds, KeyBinding, Menu, MenuItem, WindowBounds, WindowOptions,
    actions, px, size,
};
use gpui_component::Root;

use workbench::Workbench;

actions!(doolittle, [QuitDoolittle]);

#[derive(Clone)]
struct Options {
    workspace: Option<PathBuf>,
    profile: Option<PathBuf>,
    runtime_root: Option<PathBuf>,
    offline: bool,
}

fn options() -> Result<Option<Options>> {
    let mut options = Options {
        workspace: None,
        profile: None,
        runtime_root: None,
        offline: false,
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
            window.set_window_title("Doolittle");
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
                view.after_discard(window, cx, |_, window, cx| {
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
    cx.quit();
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
            Workbench::bind_keys(cx);
            cx.on_action(|_: &QuitDoolittle, cx| cx.defer(request_quit));
            let quit_key = if cfg!(target_os = "macos") {
                "cmd-q"
            } else {
                "ctrl-q"
            };
            cx.bind_keys([KeyBinding::new(quit_key, QuitDoolittle, None)]);
            cx.set_menus(vec![Menu {
                name: "Doolittle".into(),
                items: vec![MenuItem::action("Quit Doolittle", QuitDoolittle)],
            }]);
            match open_workbench(options, cx) {
                Ok(()) => {
                    cx.on_window_closed(|cx| {
                        if cx.windows().is_empty() {
                            cx.quit();
                        }
                    })
                    .detach();
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
