mod markdown_text;
mod ui;
mod workbench;

use std::path::PathBuf;

use anyhow::{Context as _, Result, bail};
use gpui::{App, AppContext, Application, Bounds, WindowBounds, WindowOptions, px, size};
use gpui_component::Root;

use workbench::Workbench;

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

fn main() -> Result<()> {
    let Some(options) = options()? else {
        return Ok(());
    };
    Application::new().run(move |cx: &mut App| {
        gpui_component::init(cx);
        Workbench::bind_keys(cx);
        let window_bounds = Bounds::centered(None, size(px(1180.), px(820.)), cx);
        let window = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(window_bounds)),
                window_min_size: Some(size(px(520.), px(420.))),
                ..WindowOptions::default()
            },
            move |window, cx| {
                window.set_window_title("Doolittle");
                let view = cx.new(|cx| Workbench::new(options, window, cx));
                cx.new(|cx| Root::new(view, window, cx))
            },
        );
        match window {
            Ok(_) => {
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
