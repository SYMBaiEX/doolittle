import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, watch } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";
import { build, createServer } from "vite";
import { cliBuildOptions } from "../../../scripts/cli-build-options";
import { DesktopDevReload } from "./dev-reload";

const desktopRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = resolve(desktopRoot, "../..");
const electronExecutable: unknown = createRequire(import.meta.url)("electron");
if (typeof electronExecutable !== "string")
  throw new Error(
    "Electron is not installed; run nub run desktop:runtime:install.",
  );
const electronPath = electronExecutable;
const electronArgs = process.argv.slice(2).filter((arg) => arg !== "--");
if (!electronArgs.some((arg) => /^--user-data-dir(?:=|$)/u.test(arg))) {
  const profile = resolve(repoRoot, "var/desktop-dev/profile");
  mkdirSync(profile, { recursive: true, mode: 0o700 });
  electronArgs.push(`--user-data-dir=${profile}`);
}
console.info(`[desktop:dev] Supervisor started (pid ${process.pid}).`);

const cleanups: Array<() => void | Promise<void>> = [];
let electron: ChildProcess | undefined;
let stopping = false;
let expectedExit: ChildProcess | undefined;
let stopFlight: Promise<void> | undefined;
let closing: Promise<void> | undefined;
let serverUrl = "";

const report = (error: unknown) =>
  console.error(
    "[desktop:dev]",
    error instanceof Error ? error.message : String(error),
  );
const reload = new DesktopDevReload(
  ["runtime", "main", "preload"],
  async (canStart) => {
    await stopElectron();
    if (!canStart() || stopping) return;
    const env = {
      ...process.env,
      DOOLITTLE_RENDERER_URL: serverUrl,
      DOOLITTLE_DESKTOP_DEV: "1",
    };
    delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE;
    const child = spawn(electronPath, [".", ...electronArgs], {
      cwd: desktopRoot,
      // Keep terminal signals on the supervisor; Electron quits through IPC.
      detached: process.platform !== "win32",
      env,
      stdio: ["inherit", "inherit", "inherit", "ipc"],
    });
    electron = child;
    console.info(`[desktop:dev] Electron started (pid ${child.pid}).`);
    child.once("error", (error) => {
      report(error);
      void shutdown(1);
    });
    child.once("exit", (code) => {
      if (electron !== child || expectedExit === child) return; // An intentional restart owns the replacement.
      electron = undefined;
      if (code === 0 || stopping) void shutdown(code ?? 1);
      else
        report(
          new Error(
            `The dev app exited (${code ?? "signal"}). Watching for the next successful edit.`,
          ),
        );
    });
  },
  report,
);

async function stopElectron(): Promise<void> {
  if (stopFlight) return stopFlight;
  stopFlight = waitForElectronExit().finally(() => {
    stopFlight = undefined;
    expectedExit = undefined;
  });
  return stopFlight;
}

async function waitForElectronExit(): Promise<void> {
  const child = electron;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  expectedExit = child;
  await new Promise<void>((resolveExit, reject) => {
    const timer = setTimeout(() => {
      child.off("exit", exited);
      reject(
        new Error(
          "Desktop has not finished quitting safely. Reload is paused; quit the dev app normally, then restart desktop:dev.",
        ),
      );
    }, 30_000);
    function exited() {
      clearTimeout(timer);
      if (electron === child) electron = undefined;
      resolveExit();
    }
    child.once("exit", exited);
    // Keep ownership until the process exits; never replace a runtime with open data files.
    if (child.connected)
      child.send("doolittle:dev:quit", (error) => {
        if (error) report(error);
      });
    else
      report(
        new Error(
          "The dev app lost its control channel. Quit it normally to allow reload.",
        ),
      );
  });
}

async function own(cleanup: () => void | Promise<void>): Promise<void> {
  if (stopping) {
    await cleanup();
    throw new Error("Development startup cancelled.");
  }
  cleanups.push(cleanup);
}

async function closeResources(): Promise<void> {
  closing ??= (async () => {
    const results = await Promise.allSettled(
      cleanups.reverse().map((close) => close()),
    );
    for (const result of results)
      if (result.status === "rejected") report(result.reason);
  })();
  await closing;
}

async function shutdown(code = 0): Promise<void> {
  stopping = true;
  reload.close();
  process.exitCode = code;
  try {
    await stopElectron();
    await closeResources();
  } catch (error) {
    report(error);
    process.exitCode = 1;
    // Leave the renderer and IPC alive so the user can finish a blocked safe quit.
  }
}

process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());

try {
  const server = await createServer({
    root: desktopRoot,
    configFile: resolve(desktopRoot, "vite.renderer.config.ts"),
    server: {
      host: "127.0.0.1",
      port: Number(process.env.DOOLITTLE_DEV_PORT ?? 5173),
      strictPort: true,
    },
  });
  await own(() => server.close());
  await server.listen();
  if (stopping) throw new Error("Development startup cancelled.");
  serverUrl = server.resolvedUrls?.local[0] ?? "";
  if (!serverUrl) throw new Error("The renderer did not publish a local URL.");
  console.info(`[desktop:dev] Renderer hot reload at ${serverUrl}`);
  for (const surface of ["main", "preload"]) {
    const watcher = await build({
      root: desktopRoot,
      configFile: resolve(desktopRoot, `vite.${surface}.config.ts`),
      build: { watch: {}, emptyOutDir: false },
    });
    if (!("on" in watcher))
      throw new Error(`The ${surface} build did not start watching.`);
    await own(() => watcher.close());
    let failed = false;
    watcher.on("event", (event) => {
      if (event.code === "START") {
        failed = false;
        reload.buildStarted(surface);
      }
      if (event.code === "END") reload.buildFinished(surface, !failed);
      if (event.code === "ERROR") {
        failed = true;
        reload.buildFinished(surface, false);
        report(event.error);
      }
    });
  }
  const runtime = await context({
    ...cliBuildOptions(),
    plugins: [
      {
        name: "desktop-dev-runtime",
        setup(build) {
          build.onStart(() => reload.buildStarted("runtime"));
          build.onEnd((result) => {
            reload.buildFinished("runtime", result.errors.length === 0);
          });
        },
      },
    ],
  });
  await own(() => runtime.dispose());
  await runtime.watch();
  for (const directory of [
    "packages/skills",
    "packages/skill-packs-optional",
    "packages/characters",
  ]) {
    const watcher = watch(
      resolve(repoRoot, directory),
      { recursive: true },
      (_event, filename) => {
        if (
          filename &&
          !/(?:^|[/\\])(?:node_modules|dist|\.generated)(?:[/\\]|$)/u.test(
            filename,
          ) &&
          /\.(?:md|json)$/u.test(filename)
        )
          reload.invalidate();
      },
    );
    watcher.on("error", report);
    await own(() => watcher.close());
  }
} catch (error) {
  report(error);
  await shutdown(1);
}
