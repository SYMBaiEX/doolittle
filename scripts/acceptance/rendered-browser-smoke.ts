import { type ChildProcess, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createEvalRuntimeEnvironment } from "@doolittle/evals/runtime-environment";
import { build } from "esbuild";
import type {
  BrowserAnalysisBundle,
  BrowserCaptureBundle,
} from "@/services/web/service";
import {
  type BackendManager,
  terminateBackendChild,
} from "../../apps/desktop/src/main/backend";
import { requestAgentTransport } from "../../apps/desktop/src/main/ipc/agent-transport";
import {
  type HeadlessModelUsage,
  readHeadlessModelUsage,
} from "../../packages/evals/src/headless/model-usage";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const root = mkdtempSync(join(tmpdir(), "doolittle-render-smoke-"));
const live = process.argv.includes("--live-analysis");
const children: ChildProcess[] = [];
let stage = "setup";
let endpointStatus: number | undefined;
const startedAt = performance.now();
const checks: Record<string, boolean> = {};
const observations: unknown[] = [];
let modelUsage: HeadlessModelUsage | null = null;
let modelUsageMalformed = false;
const providerRequests: Array<{
  status?: unknown;
  selectedModelMatches?: unknown;
  selectedEffortMatches?: unknown;
  imageInputs?: unknown;
}> = [];
function check(name: string, value: boolean) {
  checks[name] = value;
  if (!value) throw new Error(`Acceptance check failed: ${name}`);
}

function message<T>(
  child: ChildProcess,
  expectedType: string,
  timeoutMs = 90_000,
): Promise<T> {
  return new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(
      () =>
        finish(new Error(`Acceptance readiness timed out: ${expectedType}`)),
      timeoutMs,
    );
    const onMessage = (value: unknown) => {
      if (!value || typeof value !== "object" || !("type" in value)) return;
      if (value.type === expectedType) finish(undefined, value as T);
      else if (typeof value.type === "string" && value.type.endsWith("failed"))
        finish(new Error(`Acceptance child failed: ${expectedType}`));
    };
    const onExit = () =>
      finish(new Error(`Acceptance child exited before: ${expectedType}`));
    const finish = (error?: Error, value?: T) => {
      clearTimeout(timeout);
      child.off("message", onMessage);
      child.off("exit", onExit);
      child.off("error", finish);
      if (error) reject(error);
      else resolvePromise(value as T);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
    child.once("error", finish);
  });
}

try {
  mkdirSync(join(root, "data"), { mode: 0o700 });
  mkdirSync(join(root, "workspace"), { mode: 0o700 });
  writeFileSync(join(root, "data", "onboarding.json"), "{}", { mode: 0o600 });
  writeFileSync(
    join(root, "data", "settings.json"),
    JSON.stringify({
      model: {
        provider: "codex",
        model: "gpt-6-luna",
        baseUrl: "https://chatgpt.com/backend-api/codex",
        reasoningEffort: "medium",
        temperature: 0.4,
        maxTokens: 1200,
      },
      execution: { backend: "local" },
    }),
    { mode: 0o600 },
  );
  const entry = join(root, "capture-main.mjs");
  await build({
    stdin: {
      contents: `
import { app } from 'electron';
import { startBrowserRenderBridge } from ${JSON.stringify(join(repoRoot, "apps/desktop/src/main/browser-renderer.ts"))};
import { isActiveManagedRenderUrl } from ${JSON.stringify(join(repoRoot, "apps/desktop/src/main/browser-render-targets.ts"))};
app.setPath('userData', ${JSON.stringify(join(root, "electron"))});
// This capture-only test daemon has no main UI window. Keep it alive between
// owned captures; the real desktop main already handles window-all-closed.
app.on('window-all-closed', () => {});
let backend = { phase: 'booting', message: 'Acceptance runtime pending' };
let bridge;
let stopping = false;
async function stop() { if(stopping) return; stopping = true; await bridge?.dispose(); app.exit(0); }
process.on('message', value => { if(value?.type === 'runtime-ready') backend = { phase: 'ready', message:'Acceptance runtime ready', url: value.url }; if(value?.type === 'stop') void stop(); });
process.once('disconnect', () => void stop());
process.once('SIGTERM', () => void stop());
setTimeout(() => { void stop(); }, 180000).unref();
// Complete ESM entry evaluation before awaiting Electron's ready event.
app.whenReady().then(async () => { try { bridge = await startBrowserRenderBridge({ isManagedAppUrl: url => isActiveManagedRenderUrl(url, () => backend) }); if(typeof process.send !== 'function') throw new Error('Acceptance IPC is unavailable'); process.send({ type: 'bridge-ready', environment: bridge.environment }); } catch { process.send?.({ type:'bridge-failed' }); app.exit(1); } });
`,
      resolveDir: repoRoot,
      sourcefile: "rendered-capture-acceptance.ts",
    },
    outfile: entry,
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron"],
    logLevel: "silent",
  });
  stage = "electron-start";
  const electron = spawn(require("electron") as string, [entry], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  children.push(electron);
  const ready = await message<{ environment: NodeJS.ProcessEnv }>(
    electron,
    "bridge-ready",
  );
  stage = "runtime-start";
  const environment = createEvalRuntimeEnvironment({
    root,
    repoRoot,
    mode: "api",
    baseEnvironment: { ...process.env, ...ready.environment },
  });
  const runtime = spawn(
    "nub",
    [
      "scripts/acceptance/rendered-browser-runtime.ts",
      join(repoRoot, "scripts/acceptance/rendered-page-fixture.mjs"),
    ],
    {
      cwd: repoRoot,
      env: environment,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    },
  );
  children.push(runtime);
  runtime.on("message", (value) => {
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      value.type === "provider-observation"
    )
      providerRequests.push({
        status: "status" in value ? value.status : undefined,
        selectedModelMatches:
          "selectedModelMatches" in value
            ? value.selectedModelMatches
            : undefined,
        selectedEffortMatches:
          "selectedEffortMatches" in value
            ? value.selectedEffortMatches
            : undefined,
        imageInputs: "imageInputs" in value ? value.imageInputs : undefined,
      });
    if (
      value &&
      typeof value === "object" &&
      "type" in value &&
      [
        "model-observation",
        "provider-observation",
        "analysis-failure",
        "bridge-request",
        "capture-observation",
      ].includes(String(value.type)) &&
      observations.length < 32
    )
      observations.push(value);
  });
  const runtimeReady = await message<{ url: string; appUrl: string }>(
    runtime,
    "runtime-ready",
  );
  electron.send({ type: "runtime-ready", url: runtimeReady.url });
  // The synthetic runtime is owned above; exercise the actual desktop transport
  // and its route, response-size, cancellation and deadline policies.
  const transportBackend = {
    getState: () => ({
      phase: "ready",
      message: "Acceptance runtime",
      url: runtimeReady.url,
    }),
  } as BackendManager;
  const api = async (path: string, body?: unknown) => {
    const response = await requestAgentTransport(
      transportBackend,
      fetch,
      {
        requestId: "rendered-browser-acceptance",
        path,
        method: body === undefined ? "GET" : "POST",
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      AbortSignal.timeout(90_000),
    );
    endpointStatus = response.status;
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Acceptance endpoint failed (${response.status}).`);
    return JSON.parse(response.body);
  };
  stage = "native-capture";
  const status = await api("/browser/status");
  check(
    "nativeCapabilityReady",
    status.browser.captureReady === true &&
      status.browser.renderBackend === "electron-private-capture",
  );
  const { capture } = (await api("/browser/capture", {
    url: runtimeReady.appUrl,
  })) as { capture: BrowserCaptureBundle };
  check(
    "actualNativePng",
    capture.captureMode === "rendered-page" &&
      Boolean(capture.renderedEvidence?.pixels.bytes),
  );
  check(
    "desktopViewport",
    capture.renderedEvidence?.viewport.width === 1280 &&
      capture.renderedEvidence.viewport.height === 720,
  );
  check(
    "knownContrastFact",
    Boolean(
      capture.renderedEvidence?.facts.contrastCandidates.some(
        (candidate) =>
          candidate.text === "Get the letter" &&
          candidate.foreground === candidate.background,
      ),
    ),
  );
  check(
    "knownSemanticLinkFact",
    Boolean(
      capture.renderedEvidence?.facts.links.some(
        (link) =>
          link.label === "Read the city story" &&
          link.targetText?.includes("Newsletter"),
      ),
    ),
  );
  stage = "bridge-after-owned-close";
  const bridgeHealth = await fetch(
    `${ready.environment.ELIZA_BROWSER_WORKSPACE_URL}/tabs`,
    {
      headers: {
        authorization: `Bearer ${ready.environment.ELIZA_BROWSER_WORKSPACE_TOKEN}`,
      },
      signal: AbortSignal.timeout(2_000),
    },
  );
  check(
    "bridgeSurvivesOwnedClose",
    bridgeHealth.ok && electron.exitCode === null,
  );
  if (live) {
    stage = "live-native-analysis";
    const { analysis, response } = (await api("/browser/analyze", {
      url: runtimeReady.appUrl,
    })) as { analysis: BrowserAnalysisBundle; response: string };
    check(
      "nativeModelPixelInputs",
      analysis.modelEvidence === "rendered-pixels" &&
        analysis.capture.captureMode === "rendered-page",
    );
    check(
      "narrowViewport",
      analysis.narrowCapture?.renderedEvidence?.viewport.width === 390,
    );
    check(
      "liveResponse",
      typeof response === "string" &&
        response.trim().length > 0 &&
        response === analysis.response,
    );
    check(
      "contrastDefectIdentified",
      /contrast|unreadable|invisible|illegible|same.{0,15}colou?r|black.on.black/iu.test(
        response,
      ),
    );
    check(
      "semanticLinkDefectIdentified",
      /story|newsletter|link.{0,40}target/iu.test(response),
    );
    stage = "provider-coverage";
    ({ usage: modelUsage, malformed: modelUsageMalformed } =
      readHeadlessModelUsage(join(root, "data")));
    check("onePhysicalProviderRequest", providerRequests.length === 1);
    check(
      "selectedRouteAndTwoImages",
      providerRequests[0]?.status === 200 &&
        providerRequests[0].selectedModelMatches === true &&
        providerRequests[0].selectedEffortMatches === true &&
        providerRequests[0].imageInputs === 2,
    );
    check(
      "completeProviderUsage",
      !modelUsageMalformed &&
        modelUsage?.providerCalls === 1 &&
        modelUsage.completedCalls === 1 &&
        modelUsage.failedCalls === 0 &&
        modelUsage.tokenUsageSamples === 1,
    );
  }
  stage = "cleanup";
} catch (error) {
  console.error(
    JSON.stringify({
      result: "failed",
      stage,
      errorKind: error instanceof Error ? error.name : "unknown",
      checks,
      observations,
      endpointStatus,
    }),
  );
  process.exitCode = 1;
} finally {
  for (const child of children.reverse())
    await terminateBackendChild(child).catch(() => {
      process.exitCode = 1;
    });
  const childrenStopped = children.every(
    (child) => child.exitCode !== null || child.signalCode !== null,
  );
  // Never erase even private evidence while an owned child may still be live.
  let isolatedStateRemoved = false;
  if (childrenStopped) {
    try {
      rmSync(root, { recursive: true, force: true });
      isolatedStateRemoved = true;
    } catch {
      process.exitCode = 1;
    }
  } else process.exitCode = 1;
  console.log(
    JSON.stringify({
      result: process.exitCode ? "failed" : "passed",
      stage,
      liveAnalysis: live,
      elapsedMs: Math.round(performance.now() - startedAt),
      checks,
      observations,
      endpointStatus,
      physicalProviderRequests: providerRequests.length,
      modelUsage,
      modelUsageMalformed,
      rawResponsesRetained: isolatedStateRemoved ? false : null,
      childrenStopped,
      isolatedStateRemoved,
    }),
  );
}
