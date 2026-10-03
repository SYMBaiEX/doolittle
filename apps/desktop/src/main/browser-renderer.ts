import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  BrowserWindow,
  type BrowserWindowConstructorOptions,
  screen,
} from "electron";
import {
  RENDERED_FACTS_SCRIPT,
  WAIT_FOR_RENDER_SCRIPT,
} from "./browser-render-facts";
import {
  allowRenderResource,
  managedRenderUrl,
  renderViewport,
} from "./browser-render-policy";
import { captureWindowOptions } from "./browser-render-window";

const MAX_TABS = 4;
const MAX_BODY_BYTES = 8192;
const MAX_PNG_BYTES = 10 * 1024 * 1024;
const TAB_LIFETIME_MS = 30_000;
const OPERATION_TIMEOUT_MS = 10_000;

interface RenderTab {
  id: string;
  url: URL;
  window: BrowserWindow;
  viewport: { width: number; height: number };
  createdAt: string;
  timer: ReturnType<typeof setTimeout>;
  blockedRequests: number;
  capturing: boolean;
}

export interface BrowserRenderBridge {
  environment: NodeJS.ProcessEnv;
  dispose(): Promise<void>;
}

interface BridgeOptions {
  isManagedAppUrl(url: URL): Promise<boolean>;
  createWindow?: (options: BrowserWindowConstructorOptions) => BrowserWindow;
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

async function readBody(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_BODY_BYTES)
      throw new Error("Capture request exceeds its size limit.");
    chunks.push(buffer);
  }
  const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("A JSON object is required.");
  return value as Record<string, unknown>;
}

async function bounded<T>(
  promise: Promise<T>,
  window: BrowserWindow,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          if (!window.isDestroyed()) window.destroy();
          reject(new Error("Rendered capture timed out."));
        }, OPERATION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Capture-only implementation of the public Eliza browser-workspace protocol. */
export async function startBrowserRenderBridge(
  options: BridgeOptions,
): Promise<BrowserRenderBridge> {
  const token = randomBytes(32).toString("hex");
  const expectedAuthorization = Buffer.from(`Bearer ${token}`);
  const tabs = new Map<string, RenderTab>();
  let disposed = false;
  const remove = (id: string): boolean => {
    const tab = tabs.get(id);
    if (!tab) return false;
    tabs.delete(id);
    clearTimeout(tab.timer);
    if (!tab.window.isDestroyed()) tab.window.destroy();
    return true;
  };
  const describeTab = (tab: RenderTab) => ({
    id: tab.id,
    title: tab.window.isDestroyed()
      ? ""
      : tab.window.webContents.getTitle().slice(0, 300),
    url: tab.url.href,
    partition: `doolittle-capture-${tab.id}`,
    visible: false,
    createdAt: tab.createdAt,
    updatedAt: tab.createdAt,
    lastFocusedAt: null,
    provider: "doolittle-electron-capture",
    kind: "standard",
  });
  const server = createServer(
    { maxHeaderSize: 8192 },
    async (request, response) => {
      request.setTimeout(OPERATION_TIMEOUT_MS, () => request.destroy());
      const authorization = Buffer.from(
        typeof request.headers.authorization === "string"
          ? request.headers.authorization
          : "",
      );
      if (
        request.headers.origin ||
        request.headers["sec-fetch-site"] ||
        authorization.length !== expectedAuthorization.length ||
        !timingSafeEqual(authorization, expectedAuthorization)
      ) {
        json(response, 403, {
          error: "Capture bridge authorization is required.",
        });
        return;
      }
      if (disposed) {
        json(response, 503, { error: "Capture bridge is stopped." });
        return;
      }
      const path = request.url ?? "";
      let ownedTabId: string | undefined;
      try {
        if (path === "/tabs" && request.method === "GET") {
          json(response, 200, {
            mode: "desktop",
            captureProtocol: "doolittle-rendered-page-v1",
            tabs: [...tabs.values()].map(describeTab),
          });
          return;
        }
        if (path === "/tabs" && request.method === "POST") {
          if (tabs.size >= MAX_TABS) {
            json(response, 429, {
              error: "Capture concurrency limit reached.",
            });
            return;
          }
          if (
            !request.headers["content-type"]?.startsWith("application/json")
          ) {
            json(response, 415, { error: "JSON is required." });
            return;
          }
          const body = await readBody(request);
          if (
            body.show === true ||
            body.partition !== undefined ||
            body.connectorProvider !== undefined ||
            body.connectorAccountId !== undefined
          )
            throw new Error("Capture uses only a private hidden session.");
          const url = managedRenderUrl(body.url);
          if (!(await options.isManagedAppUrl(url))) {
            json(response, 403, {
              error: "The URL is not an active managed app in this workspace.",
            });
            return;
          }
          // Recheck after asynchronous authorization to enforce the capacity bound.
          if (disposed || tabs.size >= MAX_TABS) {
            json(response, 429, { error: "Capture is unavailable." });
            return;
          }
          const viewport = renderViewport(body);
          const id = randomUUID();
          const window = (
            options.createWindow ?? ((value) => new BrowserWindow(value))
          )(
            captureWindowOptions(
              {
                ...viewport,
                useContentSize: true,
                show: false,
                skipTaskbar: true,
                webPreferences: {
                  partition: `doolittle-capture-${id}`,
                  sandbox: true,
                  contextIsolation: true,
                  nodeIntegration: false,
                  webSecurity: true,
                  webviewTag: false,
                  backgroundThrottling: false,
                  devTools: false,
                },
              },
              process.platform,
              () => screen.getPrimaryDisplay().scaleFactor,
            ),
          );
          const tab: RenderTab = {
            id,
            url,
            window,
            viewport,
            createdAt: new Date().toISOString(),
            timer: setTimeout(() => remove(id), TAB_LIFETIME_MS),
            blockedRequests: 0,
            capturing: false,
          };
          tabs.set(id, tab);
          ownedTabId = id;
          try {
            window.on("closed", () => remove(id));
            const contents = window.webContents;
            contents.session.setPermissionRequestHandler(
              (_contents, _permission, callback) => callback(false),
            );
            contents.session.setPermissionCheckHandler(() => false);
            contents.session.on("will-download", (event) =>
              event.preventDefault(),
            );
            contents.setWindowOpenHandler(() => ({ action: "deny" }));
            contents.on("will-navigate", (event, nextUrl) => {
              if (
                !allowRenderResource(url, {
                  url: nextUrl,
                  method: "GET",
                  resourceType: "mainFrame",
                })
              )
                event.preventDefault();
            });
            contents.on("will-redirect", (event, nextUrl) => {
              if (
                !allowRenderResource(url, {
                  url: nextUrl,
                  method: "GET",
                  resourceType: "mainFrame",
                })
              )
                event.preventDefault();
            });
            contents.session.webRequest.onBeforeRequest(
              { urls: ["<all_urls>"] },
              (details, callback) => {
                const allowed = allowRenderResource(url, details);
                if (!allowed) tab.blockedRequests++;
                callback({ cancel: !allowed });
              },
            );
            await bounded(window.loadURL(url.href), window);
            if (!tabs.has(id) || disposed)
              throw new Error("Capture was stopped.");
            json(response, 200, { tab: describeTab(tab) });
          } catch {
            remove(id);
            json(response, 502, {
              error: "The managed app could not be rendered.",
            });
          }
          return;
        }
        const match = /^\/tabs\/([a-f0-9-]{36})(\/snapshot)?$/u.exec(path);
        if (match) {
          const tab = tabs.get(match[1]);
          if (!tab) {
            json(response, 404, { error: "Capture tab not found." });
            return;
          }
          ownedTabId = tab.id;
          if (!match[2] && request.method === "DELETE") {
            remove(tab.id);
            json(response, 200, { closed: true });
            return;
          }
          if (match[2] && request.method === "GET") {
            if (tab.capturing) {
              json(response, 409, {
                error: "This capture is already in progress.",
              });
              return;
            }
            tab.capturing = true;
            try {
              if (
                !(await options.isManagedAppUrl(tab.url)) ||
                tab.window.isDestroyed()
              ) {
                remove(tab.id);
                json(response, 403, {
                  error:
                    "The managed app is no longer available in this workspace.",
                });
                return;
              }
              const contents = tab.window.webContents;
              try {
                await bounded(
                  contents.executeJavaScript(WAIT_FOR_RENDER_SCRIPT),
                  tab.window,
                );
                const facts: unknown = await bounded(
                  contents.executeJavaScript(RENDERED_FACTS_SCRIPT),
                  tab.window,
                );
                const image = await bounded(
                  contents.capturePage(undefined, {
                    stayHidden: true,
                    stayAwake: false,
                  }),
                  tab.window,
                );
                const png = image.toPNG();
                if (
                  !png.length ||
                  png.length > MAX_PNG_BYTES ||
                  !(await options.isManagedAppUrl(tab.url)) ||
                  disposed ||
                  !tabs.has(tab.id)
                )
                  throw new Error("Capture evidence is unavailable.");
                json(response, 200, {
                  data: png.toString("base64"),
                  captureMode: "rendered-page",
                  captureProtocol: "doolittle-rendered-page-v1",
                  viewport: tab.viewport,
                  facts,
                  blockedRequests: tab.blockedRequests,
                  scope: "viewport-only-read-only",
                });
              } catch {
                remove(tab.id);
                json(response, 502, {
                  error: "Rendered evidence could not be captured.",
                });
              }
            } finally {
              tab.capturing = false;
            }
            return;
          }
        }
        // No eval, navigate, clipboard, profile, account, input or upload endpoint.
        json(response, 404, { error: "Capture operation is not supported." });
      } catch {
        if (ownedTabId) remove(ownedTabId);
        json(response, 400, { error: "Invalid capture request." });
      }
    },
  );
  server.headersTimeout = OPERATION_TIMEOUT_MS;
  server.requestTimeout = OPERATION_TIMEOUT_MS;
  server.keepAliveTimeout = 2_000;
  server.maxConnections = 32;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Capture bridge did not obtain a loopback port.");
  return {
    environment: {
      ELIZA_BROWSER_WORKSPACE_URL: `http://127.0.0.1:${address.port}`,
      ELIZA_BROWSER_WORKSPACE_TOKEN: token,
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const id of [...tabs.keys()]) remove(id);
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
