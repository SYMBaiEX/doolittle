import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
} from "@playwright/test";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

const repoRoot = resolve(import.meta.dirname, "../..");
const desktopRoot = join(repoRoot, "apps/desktop");
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
  close(): Promise<void>;
  restart(): Promise<void>;
  dispose(): Promise<void>;
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
  options: { liveCoding?: boolean } = {},
): Promise<DesktopFixture> {
  if (options.liveCoding && process.env.DOOLITTLE_RUN_LIVE_CODING !== "true") {
    throw new Error("Live coding requires explicit opt-in.");
  }
  const profile = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-fresh-profile-")),
  );
  const workspace = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-fresh-workspace-")),
  );
  const runtime = join(profile, "runtime");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    join(runtime, "settings.json"),
    `${JSON.stringify({ model: options.liveCoding ? { provider: "codex", model: "gpt-6-luna", reasoningEffort: "medium", baseUrl: "https://chatgpt.com/backend-api/codex", maxTokens: 8192 } : offlineModel })}\n`,
  );
  writeFileSync(
    join(profile, "workspace-state.json"),
    `${JSON.stringify({ currentPath: workspace, recentPaths: [workspace] })}\n`,
  );
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  const open = async () => {
    app = await electron.launch({
      ...(executablePath ? { executablePath } : {}),
      args: executablePath
        ? [`--user-data-dir=${profile}`]
        : [desktopRoot, `--user-data-dir=${profile}`],
      cwd: repoRoot,
      env: {
        ...isolatedRuntimeEnvironment(runtime),
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
        ...(!executablePath ? { DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot } : {}),
      },
    });
    const actualProfile = await app.evaluate(({ app }) =>
      app.getPath("userData"),
    );
    if (realpathSync(actualProfile) !== profile)
      throw new Error("Electron did not use the isolated fixture profile");
    const currentPage = await app.firstWindow();
    page = currentPage;
    await expect
      .poll(
        () =>
          currentPage.evaluate(
            async () => (await window.doolittle.getBackendState()).phase,
          ),
        { timeout: 60_000 },
      )
      .toBe("ready");
    await expect(currentPage.locator("[data-session-workbench]")).toBeVisible();
    // A listening API is not full startup: Eliza plugin hydration follows it.
    // Project acceptance begins only after the real runtime declares readiness.
    let startupResult = "warming";
    await expect
      .poll(
        async () => {
          startupResult = await currentPage.evaluate(async () => {
            const result = await window.doolittle.requestAgent({
              requestId: crypto.randomUUID(),
              path: "/runtime/status",
              method: "GET",
              headers: {},
            });
            if (result.status !== 200) return "warming";
            const status = JSON.parse(result.body) as {
              startup: {
                deferredReady: boolean;
                phases: Record<string, { status: string }>;
              };
            };
            const failed = Object.entries(status.startup.phases).find(
              ([, phase]) => phase.status === "error",
            );
            if (failed) return `error:${failed[0]}`;
            return status.startup.deferredReady ? "ready" : "warming";
          });
          return startupResult;
        },
        { timeout: 60_000 },
      )
      .not.toBe("warming");
    if (startupResult !== "ready")
      throw new Error(`Runtime startup failed: ${startupResult}`);
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
  botName: string | RegExp = /^Doolittle\b/u,
): Promise<string> {
  const known = await page
    .locator("[data-session-panel]")
    .evaluateAll((panels) =>
      panels.map((panel) => panel.getAttribute("data-session-panel")),
    );
  await page
    .getByRole("complementary", { name: "Navigation and bots" })
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  const chooser = page.getByRole("dialog", { name: "Start a chat with…" });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole("combobox", { name: "Project for new chat" })
    .selectOption(projectId);
  await chooser
    .getByRole("region", { name: "Available bots" })
    .getByRole("button", { name: botName })
    .click();
  await expect(chooser).toBeHidden();
  let id: string | null = null;
  await expect
    .poll(
      async () => {
        id = await page
          .locator("[data-session-panel]")
          .evaluateAll(
            (panels, existing) =>
              panels
                .map((panel) => panel.getAttribute("data-session-panel"))
                .find(
                  (candidate) => candidate && !existing.includes(candidate),
                ) ?? null,
            known,
          );
        return id;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  if (!id) throw new Error("New chat has no session ID");
  await expect(page.locator(`[data-session-panel="${id}"]`)).toBeVisible();
  return id;
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
