import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  _electron as electron,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { desktopIpcChannels } from "../../apps/desktop/src/shared/ipc-channels";
import { isolatedRuntimeEnvironment } from "./isolated-runtime-environment";

const repoRoot = process.cwd();
const desktopRoot = resolve(repoRoot, "apps/desktop");

export interface IsolatedDesktop {
  app: Awaited<ReturnType<typeof electron.launch>>;
  page: Page;
  pageErrors: string[];
  profileDir: string;
  workspaceDir: string;
  dispose(): Promise<void>;
}

/** Launch only the built desktop app with an owned profile and empty workspace. */
export async function launchIsolatedDesktop(): Promise<IsolatedDesktop> {
  const profileDir = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-workbench-profile-")),
  );
  const workspaceDir = realpathSync(
    mkdtempSync(join(tmpdir(), "doolittle-workbench-workspace-")),
  );
  writeFileSync(
    join(profileDir, "workspace-state.json"),
    `${JSON.stringify({ currentPath: workspaceDir, recentPaths: [workspaceDir] })}\n`,
    "utf8",
  );

  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  try {
    app = await electron.launch({
      args: [desktopRoot, `--user-data-dir=${profileDir}`],
      cwd: repoRoot,
      env: {
        ...isolatedRuntimeEnvironment(join(profileDir, "runtime")),
        DOOLITTLE_DESKTOP_CWD: workspaceDir,
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
      },
    });

    const page = await app.firstWindow();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.stack ?? error.message);
    });

    return {
      app,
      page,
      pageErrors,
      profileDir,
      workspaceDir,
      async dispose() {
        try {
          await app?.close();
        } finally {
          removeOwnedTempDirectory(profileDir, "doolittle-workbench-profile-");
          removeOwnedTempDirectory(
            workspaceDir,
            "doolittle-workbench-workspace-",
          );
        }
      },
    };
  } catch (error) {
    if (app) await app.close();
    removeOwnedTempDirectory(profileDir, "doolittle-workbench-profile-");
    removeOwnedTempDirectory(workspaceDir, "doolittle-workbench-workspace-");
    throw error;
  }
}

function removeOwnedTempDirectory(path: string, prefix: string): void {
  const resolved = realpathSync(path);
  const tempRoot = realpathSync(tmpdir());
  if (!resolved.startsWith(`${tempRoot}/`)) {
    throw new Error("Refusing to remove a workbench test path outside tmpdir.");
  }
  if (!resolved.split("/").at(-1)?.startsWith(prefix)) {
    throw new Error("Refusing to remove an unowned workbench test path.");
  }
  rmSync(resolved, { recursive: true, force: true });
}

export async function waitForDesktopReady(page: Page): Promise<void> {
  await expect(page).toHaveTitle(/Doolittle$/);
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const state = await window.doolittle.getBackendState();
          return state.phase;
        }),
      { timeout: 45_000 },
    )
    .toBe("ready");
  const started = Date.now();
  const observations: Array<{ elapsedMs: number; state: string }> = [];
  try {
    await expect
      .poll(
        async () => {
          const state = await page.evaluate(async () => {
            const backend = await window.doolittle.getBackendState();
            if (backend.phase !== "ready") return `backend:${backend.phase}`;
            const workbench = document.querySelector(
              "[data-session-workbench]",
            );
            if (!workbench) return "workbench:not-mounted";
            const response = await window.doolittle.requestAgent({
              requestId: crypto.randomUUID(),
              path: "/bots",
              method: "GET",
              headers: { accept: "application/json" },
            });
            if (response.status !== 200) {
              let code = "";
              try {
                const payload = JSON.parse(response.body) as { code?: unknown };
                if (typeof payload.code === "string") code = payload.code;
              } catch {
                // The status remains the authoritative diagnostic.
              }
              if (response.status === 503 && code === "bot_status_unavailable")
                return `bots:503/${code}`;
              throw new Error(
                `Native bot catalog readiness failed: HTTP ${response.status}, code ${code || "none"}.`,
              );
            }
            // The route may have changed while /bots was in flight. Reacquire
            // the current workbench and pane before sampling readiness.
            const currentWorkbench = document.querySelector(
              "[data-session-workbench]",
            );
            if (!currentWorkbench) return "workbench:not-mounted";
            const selectedTab = currentWorkbench.querySelector<HTMLElement>(
              '[role="tab"][aria-selected="true"][aria-controls]',
            );
            const selectedPanel = selectedTab
              ? document.getElementById(
                  selectedTab.getAttribute("aria-controls") ?? "",
                )
              : (() => {
                  const visible =
                    currentWorkbench.querySelectorAll<HTMLElement>(
                      "[data-session-panel]:not([hidden])",
                    );
                  return visible.length === 1 ? visible[0] : null;
                })();
            if (
              !selectedPanel?.isConnected ||
              !currentWorkbench.contains(selectedPanel) ||
              selectedPanel.closest("[hidden], [inert]") ||
              !selectedPanel.checkVisibility() ||
              selectedPanel.getClientRects().length === 0 ||
              getComputedStyle(selectedPanel).visibility !== "visible"
            )
              return "workbench:selected-panel-not-visible";
            const conversation = selectedPanel.querySelector<HTMLElement>(
              ".chat-conversation[data-run-hydration]",
            );
            if (!conversation) return "run-inventory:marker-missing";
            const hydration = conversation.dataset.runHydration;
            if (hydration === "unavailable")
              throw new Error("Native run inventory is unavailable.");
            if (hydration !== "ready")
              return `run-inventory:${hydration ?? "marker-missing"}`;
            return "ready";
          });
          observations.push({ elapsedMs: Date.now() - started, state });
          return state;
        },
        { timeout: 30_000 },
      )
      .toBe("ready");
  } finally {
    await test.info().attach("native-capability-readiness", {
      body: JSON.stringify(observations.slice(-24)),
      contentType: "application/json",
    });
  }
}

/** Hide host account metadata in isolated screenshots; all other API calls remain native. */
export async function installEmptyAccountPoolFixture(
  app: IsolatedDesktop["app"],
): Promise<void> {
  await app.evaluate(({ ipcMain }, channel) => {
    type Handler = (
      event: Electron.IpcMainInvokeEvent,
      ...args: unknown[]
    ) => unknown;
    const original = (
      ipcMain as typeof ipcMain & { _invokeHandlers?: Map<string, Handler> }
    )._invokeHandlers?.get(channel);
    if (!original)
      throw new Error("Native agent request handler is unavailable.");
    const state = { accountPoolReads: 0, activationRequests: 0 };
    Object.assign(globalThis, { __doolittleOfflineAccountFixture: state });
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, (event, unsafeRequest: unknown) => {
      const request = unsafeRequest as {
        method?: unknown;
        path?: unknown;
      } | null;
      if (
        request?.method === "GET" &&
        request.path === "/runtime/account-pool"
      ) {
        state.accountPoolReads += 1;
        return {
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ providers: {} }),
        };
      }
      if (
        request?.method === "POST" &&
        typeof request.path === "string" &&
        /^\/bots\/[^/]+\/activate$/u.test(request.path)
      ) {
        state.activationRequests += 1;
      }
      return original(event, unsafeRequest);
    });
  }, desktopIpcChannels.invoke.agentRequest);
}

export async function emptyAccountPoolFixtureState(
  app: IsolatedDesktop["app"],
) {
  return app.evaluate(() => {
    const state = (
      globalThis as typeof globalThis & {
        __doolittleOfflineAccountFixture?: {
          accountPoolReads: number;
          activationRequests: number;
        };
      }
    ).__doolittleOfflineAccountFixture;
    if (!state) throw new Error("Offline account fixture was not installed.");
    return { ...state };
  });
}

export async function openNewConversationView(page: Page): Promise<void> {
  const panels = page.locator("[data-session-panel]");
  const previousIds = new Set(
    await panels.evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("data-session-panel"))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "New conversation" }).click();
  const chooser = page.getByRole("dialog", { name: "Start a chat with…" });
  await expect(chooser).toBeVisible();
  await chooser
    .getByRole("region", { name: "Available bots" })
    .getByRole("button", { name: /^Doolittle\b/u })
    .click();
  await expect
    .poll(
      () =>
        panels.evaluateAll(
          (elements, knownIds) =>
            elements.some((element) => {
              const id = element.getAttribute("data-session-panel");
              return Boolean(id && !knownIds.includes(id));
            }),
          [...previousIds],
        ),
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function waitForSessionRunInventory(
  panel: Locator,
): Promise<void> {
  await expect(panel).toBeVisible();
  const conversation = panel.locator(".chat-conversation[data-run-hydration]");
  await expect(conversation).toBeVisible();
  await expect
    .poll(
      async () => {
        if (!(await panel.isVisible()) || !(await conversation.isVisible()))
          return "panel:not-visible";
        const hydration = await conversation.getAttribute("data-run-hydration");
        if (hydration === "unavailable")
          throw new Error("Native run inventory is unavailable.");
        return hydration;
      },
      { timeout: 30_000 },
    )
    .toBe("ready");
}

export async function closeFocusedConversationView(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Close view", exact: true }).click();
}

export async function openWorkspaceViews(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Conversation options" }).click();
  await page.getByRole("menuitem", { name: "Workspace views" }).click();
  await expect(page.locator(".session-workspace-views")).toHaveAttribute(
    "open",
    "",
  );
}
