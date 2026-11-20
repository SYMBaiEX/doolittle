import { type ChildProcess, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync, watch } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";
import { cliBuildOptions } from "./cli-build-options";
import { DesktopDevReload } from "./desktop-dev-reload";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, process.env.CARGO_TARGET_DIR || "target");
const binary = resolve(
  target,
  "debug",
  process.platform === "win32" ? "doolittle-desktop.exe" : "doolittle-desktop",
);
const guiArgs = process.argv.slice(process.argv[2] === "--" ? 3 : 2);
if (guiArgs.includes("--help") || guiArgs.includes("-h")) {
  console.info(
    "Usage: nub run desktop:dev -- [--workspace PATH] [--profile PATH] [--runtime-root PATH] [--offline]",
  );
  process.exit(0);
}
if (!guiArgs.includes("--workspace")) guiArgs.push("--workspace", root);
const workspace = guiArgs[guiArgs.indexOf("--workspace") + 1];
if (!workspace || workspace.startsWith("--")) {
  throw new Error("--workspace requires a directory");
}
if (!guiArgs.includes("--profile")) {
  const identity = createHash("sha256")
    .update(realpathSync(workspace))
    .digest("hex")
    .slice(0, 24);
  guiArgs.push("--profile", resolve(root, "var/desktop-native-dev", identity));
}

const watchers: ReturnType<typeof watch>[] = [];
let app: ChildProcess | undefined;
let expectedExit: ChildProcess | undefined;
let quitFlight: Promise<void> | undefined;
let rustTimer: ReturnType<typeof setTimeout> | undefined;
let rustDirty = false;
let rustBuilding = false;
let stopping = false;
let shutdownFlight: Promise<void> | undefined;

function report(error: unknown): void {
  console.error(
    "[native:dev]",
    error instanceof Error ? error.message : String(error),
  );
}

const reload = new DesktopDevReload(
  ["rust", "runtime"],
  async (canStart) => {
    await stopApp(canStart);
    if (!canStart()) return;
    const child = spawn(binary, ["--dev-reload", ...guiArgs], {
      cwd: root,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        DOOLITTLE_RUNTIME_ROOT: process.env.DOOLITTLE_RUNTIME_ROOT ?? root,
      },
      stdio: ["pipe", "inherit", "inherit"],
    });
    app = child;
    child.stdin?.on("error", (error) => {
      if (child === app && child !== expectedExit) report(error);
    });
    child.once("spawn", () => {
      console.info(`[native:dev] Doolittle started (pid ${child.pid}).`);
    });
    child.once("error", (error) => {
      if (app === child) app = undefined;
      report(error);
    });
    child.once("exit", (code, signal) => {
      if (app === child) app = undefined;
      if (child === expectedExit) return;
      if (stopping || code === 0) void shutdown();
      else
        report(
          `Doolittle exited (${code ?? signal}). Watching for the next edit.`,
        );
    });
  },
  report,
);

function stopApp(canQuit: () => boolean): Promise<void> {
  if (quitFlight) return quitFlight;
  const child = app;
  if (!child?.pid || !canQuit()) return Promise.resolve();
  expectedExit = child;
  quitFlight = new Promise<void>((done, reject) => {
    const deadline = Date.now() + 30_000;
    const timer = setInterval(request, 750);
    function finish(error?: Error) {
      clearInterval(timer);
      child?.off("exit", exited);
      if (error) reject(error);
      else done();
    }
    function exited() {
      finish();
    }
    function request() {
      if (!canQuit()) {
        finish();
      } else if (Date.now() >= deadline) {
        finish(
          new Error(
            "Reload is paused. Finish outstanding work, then make another source edit or quit the development app.",
          ),
        );
      } else {
        child?.stdin?.write("Q");
      }
    }
    child.once("exit", exited);
    request();
  }).finally(() => {
    expectedExit = undefined;
    quitFlight = undefined;
  });
  return quitFlight;
}

function queueRustBuild(): void {
  if (stopping) return;
  rustDirty = true;
  reload.buildStarted("rust");
  clearTimeout(rustTimer);
  if (!rustBuilding) rustTimer = setTimeout(() => void buildRust(), 120);
}

async function buildRust(): Promise<void> {
  rustBuilding = true;
  while (rustDirty && !stopping) {
    rustDirty = false;
    const ok = await new Promise<boolean>((complete) => {
      const child = spawn(
        "cargo",
        ["build", "--locked", "-p", "doolittle-desktop"],
        {
          cwd: root,
          stdio: ["ignore", "inherit", "inherit"],
        },
      );
      child.once("error", (error) => {
        report(error);
        complete(false);
      });
      child.once("exit", (code) => complete(code === 0));
    });
    if (!rustDirty) reload.buildFinished("rust", ok);
  }
  rustBuilding = false;
}

function monitor(
  path: string,
  recursive: boolean,
  match: RegExp,
  onChange: () => void,
): void {
  const watcher = watch(resolve(root, path), { recursive }, (_, name) => {
    if (name === null || match.test(name)) onChange();
  });
  watcher.on("error", report);
  watchers.push(watcher);
}

const runtime = await context({
  ...cliBuildOptions(),
  plugins: [
    {
      name: "native-desktop-dev",
      setup(build) {
        build.onStart(() => reload.buildStarted("runtime"));
        build.onEnd((result) => {
          reload.buildFinished("runtime", result.errors.length === 0);
        });
      },
    },
  ],
});

function shutdown(code = 0): Promise<void> {
  if (shutdownFlight) return shutdownFlight;
  stopping = true;
  reload.close();
  clearTimeout(rustTimer);
  for (const watcher of watchers) watcher.close();
  shutdownFlight = (async () => {
    try {
      // A version change may have cancelled the prior restart's quit request.
      await quitFlight?.catch(() => {});
      await stopApp(() => true);
      process.exitCode = code;
    } catch (error) {
      report(error);
      process.exitCode = 1;
    } finally {
      await runtime.dispose().catch(report);
    }
  })();
  return shutdownFlight;
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  monitor(".", false, /^Cargo\.(toml|lock)$/u, queueRustBuild);
  for (const path of ["apps/desktop-native", "crates"]) {
    monitor(
      path,
      true,
      /\.(?:rs|toml|json|svg|png|ttf|otf|txt)$/u,
      queueRustBuild,
    );
  }
  for (const path of ["packages/skills", "packages/characters"]) {
    monitor(
      path,
      true,
      /^(?!.*(?:^|[/\\])(?:node_modules|dist|\.generated)(?:[/\\]|$)).*\.(?:md|json)$/u,
      () => reload.invalidate(),
    );
  }
  await runtime.watch();
  queueRustBuild();
} catch (error) {
  report(error);
  await shutdown(1);
}
