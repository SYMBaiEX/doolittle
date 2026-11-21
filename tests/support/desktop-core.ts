import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
} from "@playwright/test";
import { DESKTOP_REQUEST_TIMEOUT_MS } from "../../apps/desktop/src/shared/contracts/transport";
import type { StartupStateSnapshot } from "../../packages/agent/src/services/startup-state-service";
import {
  isolatedRuntimeEnvironment,
  liveCodexModel,
} from "./isolated-runtime-environment";

const repoRoot = resolve(import.meta.dirname, "../..");
const offlineModel = {
  provider: "offline",
  model: "offline",
  baseUrl: "",
  temperature: 0,
  maxTokens: 512,
};

export interface DesktopFixture {
  app: ElectronApplication;
  page: Page;
  profile: string;
  workspace: string;
  startup: DesktopStartupTimings;
  close(): Promise<void>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
}

export interface DesktopStartupTimings {
  workbenchMs: number;
  apiReadyMs: number;
  apiReadyObservation: "event" | "snapshot";
  coreReadyMs: number;
  runtimeReadyMs: number;
}

function removeOwned(path: string, prefix: string): void {
  const resolved = realpathSync(path);
  if (
    !resolved.startsWith(`${realpathSync(tmpdir())}/`) ||
    !resolved.split("/").at(-1)?.startsWith(prefix)
  )
    throw new Error("Refusing to remove a non-fixture path");
  rmSync(resolved, { recursive: true, force: true });
}

export async function launchDesktop(
  executablePath?: string,
  options: {
    liveCoding?: boolean;
    lockedAccounts?: boolean;
    sourceCheckout?: string;
  } = {},
): Promise<DesktopFixture> {
  if (options.liveCoding && process.env.DOOLITTLE_RUN_LIVE_CODING !== "true") {
    throw new Error("Live coding requires explicit opt-in.");
  }
  if (executablePath && options.sourceCheckout) {
    throw new Error("Choose a desktop executable or a source checkout.");
  }
  const launchRoot = options.sourceCheckout ?? repoRoot;
  const profile = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-fresh-profile-")),
  );
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-fresh-workspace-")),
  );
  const runtime = join(profile, "runtime");
  const temporary = join(profile, "tmp");
  mkdirSync(runtime, { recursive: true });
  mkdirSync(temporary);
  if (options.lockedAccounts) {
    const accounts = join(runtime, "auth", "openai-codex");
    mkdirSync(accounts, { recursive: true });
    writeFileSync(
      join(accounts, "doolittle-legacy-codex.json"),
      JSON.stringify({
        id: "doolittle-legacy-codex",
        providerId: "openai-codex",
        label: "Locked fixture",
        source: "oauth",
        createdAt: 1,
        updatedAt: 1,
        credentials: {
          access: "synthetic-fixture-only",
          refresh: "",
          expires: 0,
        },
      }),
      { mode: 0o600 },
    );
  }
  writeFileSync(
    join(runtime, "settings.json"),
    `${JSON.stringify({ model: options.liveCoding ? liveCodexModel() : offlineModel })}\n`,
  );
  writeFileSync(
    join(profile, "workspace-state.json"),
    `${JSON.stringify({ currentPath: workspace, recentPaths: [workspace] })}\n`,
  );
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let startup: DesktopStartupTimings;
  const open = async () => {
    const started = performance.now();
    const startedAt = Date.now();
    const elapsed = () => Math.round(performance.now() - started);
    app = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: executablePath
        ? [`--user-data-dir=${profile}`]
        : [join(launchRoot, "apps/desktop"), `--user-data-dir=${profile}`],
      cwd: launchRoot,
      env: {
        ...isolatedRuntimeEnvironment(runtime),
        // Historical builds probe their sandbox namespace under the OS temp directory.
        TMPDIR: temporary,
        TMP: temporary,
        TEMP: temporary,
        ...(options.lockedAccounts ? { ELIZA_VAULT_PASSPHRASE: "" } : {}),
        ...(options.liveCoding
          ? {
              // Reuse existing linked authentication without copying credentials.
              // Every SDK/app store remains in the isolated fixture runtime.
              HOME: homedir(),
              USERPROFILE: homedir(),
              DOOLITTLE_OFFLINE_BOOTSTRAP: "false",
              DOOLITTLE_USE_LINKED_CODEX_AUTH: "true",
              DOOLITTLE_EVAL_CAPTURE_MODEL_USAGE: "true",
            }
          : {}),
        DOOLITTLE_DESKTOP_CWD: workspace,
        ...(!executablePath
          ? { DOOLITTLE_DESKTOP_SOURCE_ROOT: launchRoot }
          : {}),
      },
    });
    const actualProfile = await app.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    if (realpathSync(actualProfile) !== profile)
      throw new Error("Electron did not use the isolated fixture profile");
    const currentPage = await app.firstWindow();
    page = currentPage;
    const workbench = currentPage
      .locator("[data-session-workbench]")
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(elapsed);
    // The app verifies the listening worker before publishing its ready event.
    const waitForRuntime = async () => {
      await currentPage.waitForFunction(() => Boolean(window.doolittle), null, {
        timeout: 60_000,
      });
      const { readyAt, observation } = await currentPage.evaluate(() => {
        const desktop = window.doolittle;
        type BackendState = Awaited<ReturnType<typeof desktop.getBackendState>>;
        return new Promise<{
          readyAt: number;
          observation: "event" | "snapshot";
        }>((resolve, reject) => {
          const done = () => {
            clearTimeout(timeout);
            unsubscribe();
          };
          const observe = (
            state: BackendState,
            observation: "event" | "snapshot",
          ) => {
            if (state.phase === "ready") {
              const readyAt = Date.now();
              done();
              resolve({ readyAt, observation });
            } else if (
              state.phase === "degraded" ||
              state.phase === "stopped"
            ) {
              done();
              reject(new Error(state.detail ?? state.message));
            }
          };
          const timeout = setTimeout(() => {
            done();
            reject(new Error("Timed out waiting for the desktop API"));
          }, 60_000);
          const unsubscribe = desktop.onBackendState((state) =>
            observe(state, "event"),
          );
          // Subscribe first so a transition during the initial read is observed.
          void desktop.getBackendState().then(
            (state) => observe(state, "snapshot"),
            (error: unknown) => {
              done();
              reject(error);
            },
          );
        });
      });
      let startupSnapshot: StartupStateSnapshot | undefined;
      await expect
        .poll(
          async () => {
            startupSnapshot = await currentPage.evaluate(async () => {
              const result = await window.doolittle.requestAgent({
                requestId: crypto.randomUUID(),
                path: "/runtime/status",
                method: "GET",
                headers: {},
              });
              if (result.status !== 200) return undefined;
              return (
                JSON.parse(result.body) as { startup: StartupStateSnapshot }
              ).startup;
            });
            if (!startupSnapshot) return "warming";
            const failed = Object.values(startupSnapshot.phases).find(
              (phase) => phase.status === "error",
            );
            if (failed) return `error:${failed.id}`;
            return startupSnapshot.hotPathReady && startupSnapshot.deferredReady
              ? "ready"
              : "warming";
          },
          { timeout: 60_000, intervals: [25, 50, 100] },
        )
        .not.toBe("warming");
      if (!startupSnapshot?.hotPathReady || !startupSnapshot.deferredReady) {
        const failed = Object.values(startupSnapshot?.phases ?? {}).find(
          (phase) => phase.status === "error",
        );
        throw new Error(`Runtime startup failed: ${failed?.id ?? "unknown"}`);
      }
      // Worker timestamps avoid charging request and poll latency to SDK boot.
      const phases = Object.values(startupSnapshot.phases);
      const coreReadyAt = Date.parse(startupSnapshot.phases.runtime.updatedAt);
      const runtimeReadyAt = Math.max(
        ...phases.map((phase) => Date.parse(phase.updatedAt)),
      );
      if (!Number.isFinite(runtimeReadyAt) || coreReadyAt < startedAt) {
        throw new Error("Invalid runtime startup timestamps");
      }
      return {
        apiReadyMs: readyAt - startedAt,
        apiReadyObservation: observation,
        coreReadyMs: coreReadyAt - startedAt,
        runtimeReadyMs: runtimeReadyAt - startedAt,
      };
    };
    const [workbenchMs, runtimeTimings] = await Promise.all([
      workbench,
      waitForRuntime(),
    ]);
    startup = { workbenchMs, ...runtimeTimings };
    await expect
      .poll(
        async () => {
          const result = await currentPage.evaluate(async () =>
            window.doolittle.requestAgent({
              requestId: crypto.randomUUID(),
              path: "/bots",
              method: "GET",
              headers: {},
            }),
          );
          return result.status;
        },
        { timeout: 30_000 },
      )
      .toBe(200);
  };
  try {
    await open();
  } catch (error) {
    await app?.close();
    removeOwned(profile, "doolittle-fresh-profile-");
    removeOwned(workspace, "doolittle-fresh-workspace-");
    throw error;
  }
  return {
    get app() {
      if (!app) throw new Error("Desktop app is closed");
      return app;
    },
    get page() {
      if (!page) throw new Error("Desktop page is closed");
      return page;
    },
    profile,
    workspace,
    get startup() {
      return startup;
    },
    async close() {
      await app?.close();
      app = undefined;
      page = undefined;
    },
    async restart() {
      await app?.close();
      app = undefined;
      page = undefined;
      await open();
    },
    async dispose() {
      await app?.close();
      removeOwned(profile, "doolittle-fresh-profile-");
      removeOwned(workspace, "doolittle-fresh-workspace-");
    },
  };
}

export async function agentRequest<T = unknown>(
  page: Page,
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
  botId?: string,
) {
  return page.evaluate(
    async ({ path, method, body, botId }) => {
      const result = await window.doolittle.requestAgent({
        requestId: crypto.randomUUID(),
        path,
        method,
        ...(botId ? { botId } : {}),
        headers: body ? { "content-type": "application/json" } : {},
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (result.status < 200 || result.status >= 300)
        throw new Error(`${path}: HTTP ${result.status} ${result.body}`);
      return JSON.parse(result.body) as unknown;
    },
    { path, method, body, botId },
  ) as Promise<T>;
}

export async function makeProject(
  page: Page,
  name: string,
  root: string,
): Promise<string> {
  const result = await agentRequest<{ project: { id: string } }>(
    page,
    "/projects",
    "POST",
    {
      name,
      primaryPath: root,
    },
  );
  // API fixture setup must be visible to the actual renderer's project inventory.
  await page.reload();
  await expect(page.locator("[data-session-workbench]")).toBeVisible();
  return result.project.id;
}

export async function openProjectChat(
  page: Page,
  projectId: string,
  botName = "Doolittle",
): Promise<string> {
  const sidebar = page.getByRole("complementary", {
    name: "Navigation and bots",
  });
  await chooseSidebarChatScope(page, botName);
  await sidebar
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const chooser = page.getByRole("dialog", {
    name: `Start a chat with ${botName}`,
    exact: true,
  });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole("combobox", { name: "Project for new chat" })
    .selectOption(projectId);
  const previous = await page.evaluate(
    async () => (await window.doolittle.ui?.getSelection())?.sessionId,
  );
  await chooser
    .getByRole("button", { name: `Start chat with ${botName}`, exact: true })
    .click();
  // Creating a chat awaits its durable host binding, not just a UI animation.
  try {
    await expect(chooser).toBeHidden({ timeout: DESKTOP_REQUEST_TIMEOUT_MS });
  } catch (error) {
    throw new Error(
      `Conversation chooser did not close: ${await chooser.textContent()}`,
      { cause: error },
    );
  }
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        const next = await page.evaluate(
          async () => (await window.doolittle.ui?.getSelection())?.sessionId,
        );
        id = next && next !== previous ? next : null;
        return id;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  if (!id) throw new Error("New chat has no session ID");
  await expect(page.locator(`[data-session-panel="${id}"]`)).toBeVisible();
  return id;
}

export function sidebarChatScope(page: Page) {
  return page
    .getByRole("complementary", { name: "Navigation and bots" })
    .getByRole("button", { name: /^Chat scope:/u });
}

export async function chooseSidebarChatScope(page: Page, label: string) {
  await sidebarChatScope(page).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}

/** Count only native project prompts for this fixture root; no real user folder can be approved. */
export async function installProjectDialog(
  app: ElectronApplication,
  root: string,
  response: "grant" | "cancel" = "grant",
): Promise<void> {
  const canonical = realpathSync(root);
  const fixtureRelative = relative(realpathSync(tmpdir()), canonical);
  if (
    canonical !== resolve(root) ||
    !/^doolittle-fresh-workspace-[^/]+(?:\/|$)/u.test(fixtureRelative)
  )
    throw new Error(
      "Project dialog fixture requires an owned canonical scratch root",
    );
  await app.evaluate(
    ({ dialog }, { root, response }) => {
      type FixtureState = {
        count: number;
        root: string;
        response: "grant" | "cancel";
      };
      const fixtureGlobal = globalThis as typeof globalThis & {
        __freshProjectDialog?: FixtureState;
      };
      const existing = fixtureGlobal.__freshProjectDialog;
      if (existing) {
        existing.count = 0;
        existing.root = root;
        existing.response = response;
        return;
      }
      const state: FixtureState = {
        count: 0,
        root,
        response,
      };
      fixtureGlobal.__freshProjectDialog = state;
      dialog.showMessageBox = (async (...args: unknown[]) => {
        const options = args.at(-1) as Electron.MessageBoxOptions;
        if (
          options.title === "Allow this bot to work in this project?" &&
          options.detail?.includes(`Workspace: ${state.root}.`) &&
          options.buttons?.includes("Allow project access")
        ) {
          state.count++;
          return {
            response:
              state.response === "grant"
                ? options.buttons.indexOf("Allow project access")
                : (options.cancelId ?? 1),
            checkboxChecked: false,
          };
        }
        throw new Error("Unexpected confirmation in isolated project fixture");
      }) as typeof dialog.showMessageBox;
    },
    { root, response },
  );
}

export async function projectDialogCount(
  app: ElectronApplication,
): Promise<number> {
  return app.evaluate(
    () =>
      (
        globalThis as typeof globalThis & {
          __freshProjectDialog?: { count: number };
        }
      ).__freshProjectDialog?.count ?? 0,
  );
}
