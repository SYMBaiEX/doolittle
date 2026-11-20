use std::env;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, ExitStatus, Stdio};

use anyhow::{Context, Result, bail, ensure};
use clap::Subcommand;
use doolittle_host::RuntimeService;

use crate::{Args, Connection, print_json};

const DESKTOP_EXE: &str = if cfg!(windows) {
    "doolittle-desktop.exe"
} else {
    "doolittle-desktop"
};
const SOURCE_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");

#[derive(Subcommand)]
pub(crate) enum NativeCommand {
    /// Report the native clients available alongside this binary
    Status,
    /// Build the native desktop and terminal clients from source
    Build,
    /// Check all of the repository's Rust workspaces
    Coverage,
    /// Probe the authenticated ElizaOS health endpoint
    Probe {
        #[arg(long)]
        json: bool,
    },
}

pub(crate) fn native(args: &Args, action: NativeCommand) -> Result<ExitCode> {
    match action {
        NativeCommand::Status => {
            let available = desktop_binary(false)?;
            if let Some(binary) = available {
                println!(
                    "GPUI desktop  {}",
                    crate::operator::one_line(&binary.to_string_lossy())
                );
            } else {
                println!("GPUI desktop  build required");
            }
            println!("Rust CLI      {}", env!("CARGO_PKG_VERSION"));
        }
        NativeCommand::Build => {
            ensure!(args.url.is_none(), "Building requires a local checkout");
            return workspace_cargo(&["build", "--workspace", "--locked", "--release"]);
        }
        NativeCommand::Coverage => {
            ensure!(args.url.is_none(), "Checking requires a local checkout");
            return workspace_cargo(&["check", "--workspace", "--locked"]);
        }
        NativeCommand::Probe { json } => {
            let connection = Connection::open(args)?;
            let health = connection.client.get_json("/health", None)?;
            if json {
                print_json(&health)?;
            } else {
                println!(
                    "Runtime {}",
                    crate::operator::one_line(
                        health
                            .get("status")
                            .and_then(serde_json::Value::as_str)
                            .unwrap_or("reachable")
                    )
                );
            }
        }
    }
    Ok(ExitCode::SUCCESS)
}

pub(crate) fn serve(args: &Args, mode: RuntimeService) -> Result<ExitCode> {
    ensure!(
        args.url.is_none(),
        "Serving ElizaOS requires a local managed profile"
    );
    Ok(exit_code(args.sidecar_config()?.serve(mode)?))
}

pub(crate) fn desktop(
    args: &Args,
    source: bool,
    build_only: bool,
    skip_build: bool,
    force_build: bool,
) -> Result<ExitCode> {
    ensure!(
        args.url.is_none(),
        "Launching the desktop requires a workspace or a folder selection"
    );
    ensure!(
        !build_only || !skip_build,
        "--build-only conflicts with --skip-build"
    );
    let current = desktop_binary(source)?;
    if force_build || build_only || (!skip_build && current.is_none()) {
        let mut task = vec!["build", "--locked", "-p", "doolittle-desktop"];
        if !source {
            task.push("--release");
        }
        let status = workspace_cargo(&task)?;
        if status != ExitCode::SUCCESS || build_only {
            return Ok(status);
        }
    }
    let path = desktop_binary(source)?.context("GPUI desktop is missing. Build it with `doolittle-native desktop --build-only` from source")?;
    let mut command = Command::new(&path);
    let implicit_root = source_root()
        .and_then(|root| root.canonicalize().ok())
        .filter(|root| {
            path.canonicalize()
                .is_ok_and(|path| path.starts_with(root.join("target")))
        });
    let runtime_root = args.runtime_root.as_ref().or(implicit_root.as_ref());
    for (flag, path) in [
        ("--workspace", args.workspace.as_ref()),
        ("--profile", args.profile.as_ref()),
        ("--runtime-root", runtime_root),
    ] {
        if let Some(path) = path {
            command.arg(flag).arg(path);
        }
    }
    if args.offline {
        command.arg("--offline");
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt as _;
        command.process_group(0);
    }
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("Open the GPUI desktop")?;
    Ok(ExitCode::SUCCESS)
}

fn desktop_binary(source: bool) -> Result<Option<PathBuf>> {
    let executable = env::current_exe()?;
    let directory = executable
        .parent()
        .context("Find the installed native clients")?;
    let source_binary = source_root().map(|root| {
        root.join("target")
            .join(if source { "debug" } else { "release" })
            .join(DESKTOP_EXE)
    });
    if source {
        return Ok(source_binary.filter(|path| path.is_file()));
    }
    Ok([directory.join("Doolittle"), directory.join(DESKTOP_EXE)]
        .into_iter()
        .chain(source_binary)
        .find(|path| path.is_file()))
}

fn source_root() -> Option<&'static Path> {
    let root = Path::new(SOURCE_ROOT);
    if root.join("Cargo.toml").is_file() && root.join("apps/desktop-native/Cargo.toml").is_file() {
        Some(root)
    } else {
        None
    }
}

fn workspace_cargo(args: &[&str]) -> Result<ExitCode> {
    let Some(root) = source_root() else {
        bail!("This operation requires the Doolittle source checkout");
    };
    Ok(exit_code(
        Command::new("cargo")
            .args(args)
            .current_dir(root)
            .status()
            .context("Run the Doolittle Cargo workspace command")?,
    ))
}

fn exit_code(status: ExitStatus) -> ExitCode {
    status
        .code()
        .and_then(|code| u8::try_from(code).ok())
        .map(ExitCode::from)
        .unwrap_or(ExitCode::FAILURE)
}
