use std::{
    env,
    fs::{DirBuilder, File},
    io::{BufRead, BufReader, Read},
    path::{Path, PathBuf},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc::{self, RecvTimeoutError, SyncSender},
    thread,
    time::{Duration, Instant},
};

use anyhow::{Context, Result, bail, ensure};
use directories::ProjectDirs;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use url::Url;

const READY_PREFIX: &[u8] = b"DOOLITTLE_NATIVE_READY ";
const READY_TIMEOUT: Duration = Duration::from_secs(90);
const CLEAN_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_STDOUT_LINE_BYTES: usize = 8 * 1024;
const DEVELOPMENT_ROOT: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../..");

pub struct SidecarConfig {
    workspace: PathBuf,
    profile: PathBuf,
    runtime_root: PathBuf,
    node: PathBuf,
    offline: bool,
}

impl SidecarConfig {
    /// An explicit runtime root may override the shipped runtime or source checkout.
    /// Workspace contents are never considered when resolving runnable code.
    pub fn discover(
        workspace: &Path,
        profile: Option<&Path>,
        runtime_root: Option<&Path>,
        offline: bool,
    ) -> Result<Self> {
        let workspace = workspace
            .canonicalize()
            .context("Could not open the selected workspace")?;
        ensure!(
            workspace.is_dir(),
            "The selected workspace must be a directory"
        );
        let runtime_root = find_runtime_root(runtime_root)?;
        let profile = match profile {
            Some(path) => path.to_path_buf(),
            None => default_profile(&workspace)?,
        };
        let node = discover_node(&runtime_root)?;
        Self::prepare(workspace, profile, runtime_root, node, offline)
    }

    fn prepare(
        workspace: PathBuf,
        profile: PathBuf,
        runtime_root: PathBuf,
        node: PathBuf,
        offline: bool,
    ) -> Result<Self> {
        let mut builder = DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt as _;
            builder.mode(0o700);
        }
        builder
            .create(&profile)
            .context("Could not create the native profile")?;
        let profile = profile
            .canonicalize()
            .context("Could not open the native profile")?;
        Ok(Self {
            workspace,
            profile,
            runtime_root,
            node,
            offline,
        })
    }

    pub fn profile(&self) -> &Path {
        &self.profile
    }
}

fn find_runtime_root(explicit: Option<&Path>) -> Result<PathBuf> {
    if let Some(explicit) = explicit
        .map(PathBuf::from)
        .or_else(|| env::var_os("DOOLITTLE_RUNTIME_ROOT").map(PathBuf::from))
    {
        let root = explicit
            .canonicalize()
            .context("Could not open the configured ElizaOS runtime directory")?;
        ensure!(
            runtime_entry(&root).is_some(),
            "The configured runtime directory is missing its built ElizaOS entrypoint"
        );
        return Ok(root);
    }

    let executable = env::current_exe().context("Could not locate Doolittle's executable")?;
    let packaged = executable
        .parent()
        .into_iter()
        .flat_map(|parent| [parent.join("runtime"), parent.join("../Resources/runtime")]);
    for root in packaged {
        if let Ok(root) = root.canonicalize()
            && runtime_entry(&root).is_some()
        {
            return Ok(root);
        }
    }

    if cfg!(debug_assertions)
        && let Ok(root) = Path::new(DEVELOPMENT_ROOT).canonicalize()
        && runtime_entry(&root).is_some()
    {
        return Ok(root);
    }
    bail!(
        "The ElizaOS runtime was not found. Build the runtime with `nub run cli:build` and pass --runtime-root to a source build, or use a packaged runtime."
    )
}

fn runtime_entry(root: &Path) -> Option<PathBuf> {
    [
        root.join("doolittle-runtime.mjs"),
        root.join("apps/cli/dist/index.js"),
    ]
    .into_iter()
    .find(|candidate| candidate.is_file())
}

fn discover_node(runtime_root: &Path) -> Result<PathBuf> {
    if let Some(configured) = env::var_os("DOOLITTLE_NODE") {
        let node = PathBuf::from(configured);
        ensure!(
            node.is_absolute() && node.is_file(),
            "DOOLITTLE_NODE must identify an absolute Node executable"
        );
        return Ok(node);
    }
    let packed = runtime_root
        .join("bin")
        .join(if cfg!(windows) { "node.exe" } else { "node" });
    if packed.is_file() {
        return Ok(packed);
    }
    which::which("node").context("Node.js is required to start the ElizaOS runtime")
}

fn default_profile(workspace: &Path) -> Result<PathBuf> {
    let locations = ProjectDirs::from("", "Doolittle", "Doolittle Native")
        .context("Could not determine the native Doolittle data directory")?;
    let scope = format!(
        "{:x}",
        Sha256::digest(workspace.as_os_str().as_encoded_bytes())
    );
    Ok(locations.data_local_dir().join("profiles").join(scope))
}

pub struct RuntimeSidecar {
    endpoint: String,
    token: String,
    child: Child,
    input: Option<ChildStdin>,
    _profile_lock: File,
}

impl RuntimeSidecar {
    pub fn launch(config: &SidecarConfig) -> Result<Self> {
        let profile_lock = File::options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(config.profile.join("native-runtime.lock"))
            .context("Could not open the native profile lock")?;
        profile_lock
            .try_lock()
            .context("The native profile is already open or cannot be locked")?;

        let entry =
            runtime_entry(&config.runtime_root).context("The built ElizaOS runtime is missing")?;
        let mut token_bytes = [0_u8; 32];
        getrandom::fill(&mut token_bytes)
            .map_err(|err| anyhow::anyhow!("Could not generate the runtime token: {err}"))?;
        let token = token_bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();

        let mut command = Command::new(&config.node);
        command
            .arg(entry)
            .arg("native-api")
            .current_dir(&config.runtime_root)
            .env("DOOLITTLE_REPO_ROOT", &config.runtime_root)
            .env("DOOLITTLE_MODE", "api")
            .env("DOOLITTLE_WORKSPACE_DIR", &config.workspace)
            .env("DOOLITTLE_DATA_DIR", &config.profile)
            .env("DOOLITTLE_GATEWAY_DATA_DIR", config.profile.join("gateway"))
            .env("DOOLITTLE_HOOKS_DIR", config.profile.join("hooks"))
            .env("DOOLITTLE_SKILLS_DIR", config.profile.join("skills"))
            .env(
                "ELIZAOS_BUNDLED_SKILLS_DIR",
                config.runtime_root.join("packages/skills"),
            )
            .env("PGLITE_DATA_DIR", config.profile.join("pglite"))
            .env("ELIZA_HOME", &config.profile)
            .env("ELIZA_STATE_DIR", &config.profile)
            .env("ELIZA_API_BIND", "127.0.0.1")
            .env("ELIZA_API_PORT", "0")
            .env("ELIZA_API_TOKEN", &token)
            .env(
                "DOOLITTLE_OFFLINE_BOOTSTRAP",
                if config.offline { "true" } else { "false" },
            )
            .env("DATABASE_URL", "")
            .env("POSTGRES_URL", "")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());

        for variable in [
            "NODE_OPTIONS",
            "NODE_PATH",
            "DOOLITTLE_DESKTOP_RUNTIME",
            "DOOLITTLE_DESKTOP_CONTROL_TOKEN",
            "DOOLITTLE_SHARED_ENGINE",
            "DOOLITTLE_ENGINE_WORKER_ENTRY",
            "DOOLITTLE_BOT_RUNTIME",
            "DOOLITTLE_HOST_BOT_ID",
        ] {
            command.env_remove(variable);
        }

        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt as _;
            command.process_group(0);
        }
        let mut child = command
            .spawn()
            .context("Could not start the ElizaOS runtime with Node.js")?;
        let input = child.stdin.take();
        let output = child.stdout.take().expect("spawn created a piped stdout");
        let (sender, receiver) = mpsc::sync_channel(1);
        let mut sidecar = Self {
            endpoint: String::new(),
            token,
            child,
            input,
            _profile_lock: profile_lock,
        };
        thread::Builder::new()
            .name("eliza-runtime-output".into())
            .spawn(move || read_runtime_output(output, sender))
            .context("Could not listen for ElizaOS startup")?;

        sidecar.endpoint = match receiver.recv_timeout(READY_TIMEOUT) {
            Ok(endpoint) => endpoint?,
            Err(RecvTimeoutError::Timeout) => bail!(
                "ElizaOS did not report readiness within the startup window. Check the native profile logs."
            ),
            Err(RecvTimeoutError::Disconnected) => {
                let status = sidecar.child.try_wait()?.map_or_else(
                    || "readiness channel closed".to_string(),
                    |status| status.to_string(),
                );
                bail!(
                    "ElizaOS exited before it was ready ({status}). Check the native profile logs."
                )
            }
        };
        Ok(sidecar)
    }

    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    pub fn token(&self) -> &str {
        &self.token
    }
}

impl Drop for RuntimeSidecar {
    fn drop(&mut self) {
        drop(self.input.take());
        let deadline = Instant::now() + CLEAN_SHUTDOWN_TIMEOUT;
        while Instant::now() < deadline {
            match self.child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => thread::sleep(Duration::from_millis(25)),
                Err(_) => break,
            }
        }
        #[cfg(unix)]
        if let Ok(pid) = i32::try_from(self.child.id()) {
            let _ = nix::sys::signal::killpg(
                nix::unistd::Pid::from_raw(pid),
                nix::sys::signal::Signal::SIGKILL,
            );
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn read_runtime_output(output: impl Read, sender: SyncSender<Result<String>>) {
    let mut buffer = BufReader::new(output);
    let mut line = Vec::new();
    let mut oversized = false;
    let mut sender = Some(sender);
    while let Ok(bytes) = buffer.fill_buf() {
        if bytes.is_empty() {
            break;
        }
        let ending = bytes.iter().position(|byte| *byte == b'\n');
        let consumed = ending.map_or(bytes.len(), |ending| ending + 1);
        if !oversized && line.len() + consumed <= MAX_STDOUT_LINE_BYTES {
            line.extend_from_slice(&bytes[..consumed]);
        } else {
            oversized = true;
        }
        buffer.consume(consumed);
        if ending.is_some() {
            if !oversized
                && let Some(payload) = line.strip_prefix(READY_PREFIX)
                && let Some(sender) = sender.take()
            {
                let _ = sender.send(decode_endpoint(payload));
            }
            oversized = false;
            line.clear();
        }
    }
}

fn decode_endpoint(payload: &[u8]) -> Result<String> {
    #[derive(Deserialize)]
    struct ReadyEvent {
        url: String,
    }
    let ReadyEvent { url } =
        serde_json::from_slice(payload).context("ElizaOS returned an invalid readiness record")?;
    let url = Url::parse(&url).context("ElizaOS returned an invalid endpoint")?;
    ensure!(
        url.scheme() == "http"
            && url.host_str() == Some("127.0.0.1")
            && url.port().is_some_and(|port| port != 0)
            && url.username().is_empty()
            && url.password().is_none()
            && url.path() == "/"
            && url.query().is_none()
            && url.fragment().is_none(),
        "ElizaOS did not report the private loopback endpoint"
    );
    Ok(url.to_string().trim_end_matches('/').to_string())
}
