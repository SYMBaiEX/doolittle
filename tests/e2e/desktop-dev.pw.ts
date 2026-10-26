import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  type Browser,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { isolatedRuntimeEnvironment } from "../support/isolated-runtime-environment";

const repoRoot = resolve(import.meta.dirname, "../..");
function ownedRuntimePids(rootPid: number): number[] {
  const rows = execFileSync("ps", ["-axo", "pid=,ppid=,comm="], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .flatMap((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(.+)$/u.exec(line);
      return match
        ? [
            {
              pid: Number(match[1]),
              parent: Number(match[2]),
              command: match[3] ?? "",
            },
          ]
        : [];
    });
  const owned = new Set([rootPid]);
  for (let previous = -1; previous !== owned.size; ) {
    previous = owned.size;
    for (const row of rows) if (owned.has(row.parent)) owned.add(row.pid);
  }
  return rows
    .filter(
      (row) =>
        owned.has(row.pid) &&
        /(?:^|\/)(?:node(?:-MainThread)?|nub[^/]*)$/u.test(row.command),
    )
    .map((row) => row.pid);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("development hot-reloads UI and safely replaces main, preload and runtime after valid edits", async () => {
  test.skip(
    process.platform === "win32",
    "This process-ownership acceptance uses POSIX ps.",
  );
  const profile = mkdtempSync(resolve(tmpdir(), "doolittle-dev-profile-"));
  const runtime = resolve(profile, "runtime");
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    resolve(runtime, "settings.json"),
    JSON.stringify({
      model: {
        provider: "offline",
        model: "offline",
        baseUrl: "",
        temperature: 0,
        maxTokens: 512,
      },
    }),
  );
  const dev = spawn(
    "nub",
    [
      resolve(repoRoot, "apps/desktop/scripts/dev.ts"),
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
    ],
    {
      cwd: repoRoot,
      detached: true,
      env: {
        ...isolatedRuntimeEnvironment(runtime),
        DOOLITTLE_DEV_PORT: "0",
        DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
        DOOLITTLE_DESKTOP_CWD: repoRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  dev.stdout?.on("data", (chunk) => {
    logs += String(chunk);
  });
  dev.stderr?.on("data", (chunk) => {
    logs += String(chunk);
  });
  let browser: Browser | undefined;
  const observedRuntimePids = new Set<number>();
  const edits: Array<{ path: string; marker: string }> = [];
  const supervisorPid = () =>
    Number(/Supervisor started \(pid (\d+)\)/u.exec(logs)?.[1]);
  const electronPids = () =>
    [...logs.matchAll(/Electron started \(pid (\d+)\)/gu)].map((match) =>
      Number(match[1]),
    );
  const edit = (path: string, invalid = false) => {
    const marker = invalid
      ? `\nconst broken_${randomUUID().replaceAll("-", "")} = ;\n`
      : `\n// dev-reload-acceptance ${randomUUID()}\n`;
    const entry = { path: resolve(repoRoot, path), marker };
    edits.push(entry);
    appendFileSync(entry.path, marker);
    return entry;
  };
  const restore = (entry: { path: string; marker: string }) => {
    const text = readFileSync(entry.path, "utf8");
    if (text.includes(entry.marker))
      writeFileSync(entry.path, text.replace(entry.marker, ""));
  };
  const connect = async (): Promise<{ page: Page; runtimePids: number[] }> => {
    const endpoints = [
      ...logs.matchAll(/DevTools listening on (ws:\/\/\S+)/gu),
    ];
    const endpoint = endpoints.at(-1)?.[1];
    expect(endpoint, logs.slice(-2500)).toBeTruthy();
    browser = await chromium.connectOverCDP(endpoint as string);
    const context = browser.contexts()[0];
    await expect.poll(() => context?.pages().length ?? 0).toBeGreaterThan(0);
    const page = context?.pages()[0] as Page;
    await expect
      .poll(
        () =>
          page.evaluate(
            async () => (await window.doolittle?.getBackendState())?.phase,
          ),
        { timeout: 60_000 },
      )
      .toBe("ready");
    const runtimePids = ownedRuntimePids(electronPids().at(-1) as number);
    expect(runtimePids.length).toBeGreaterThan(0);
    for (const pid of runtimePids) observedRuntimePids.add(pid);
    return { page, runtimePids };
  };
  try {
    await expect
      .poll(() => [...logs.matchAll(/DevTools listening on /gu)].length, {
        timeout: 45_000,
      })
      .toBe(1);
    let current = await connect();
    const firstPid = electronPids().at(-1) as number;
    // A renderer edit is served by Vite without replacing Electron or its runtime.
    const cssPath = resolve(
      repoRoot,
      "apps/desktop/src/renderer/surface-motion.css",
    );
    const cssValue = `probe-${randomUUID()}`;
    const cssMarker = `\n:root { --doolittle-dev-acceptance: ${cssValue}; }\n`;
    const cssEdit = { path: cssPath, marker: cssMarker };
    edits.push(cssEdit);
    appendFileSync(cssPath, cssMarker);
    await expect
      .poll(() =>
        current.page.evaluate(() =>
          getComputedStyle(document.documentElement)
            .getPropertyValue("--doolittle-dev-acceptance")
            .trim(),
        ),
      )
      .toBe(cssValue);
    expect(electronPids()).toEqual([firstPid]);
    restore(cssEdit);

    for (const path of [
      "apps/desktop/src/main/renderer-url.ts",
      "apps/desktop/src/preload/extension-bridge.ts",
      "apps/desktop/src/shared/ipc-channels.ts",
      "packages/agent/src/runtime/stable-runtime-uuid.ts",
    ]) {
      const oldPid = electronPids().at(-1) as number;
      const count = electronPids().length;
      const oldRuntimePids = current.runtimePids;
      const entry = edit(path);
      await expect
        .poll(() => electronPids().length, { timeout: 45_000 })
        .toBe(count + 1);
      await expect.poll(() => alive(oldPid)).toBe(false);
      await expect.poll(() => oldRuntimePids.some(alive)).toBe(false);
      await expect
        .poll(() => [...logs.matchAll(/DevTools listening on /gu)].length)
        .toBe(count + 1);
      current = await connect();
      expect(
        current.runtimePids.some((pid) => oldRuntimePids.includes(pid)),
      ).toBe(false);
      // Restore before the next case and let that source change finish reloading too.
      restore(entry);
      await expect
        .poll(() => electronPids().length, { timeout: 45_000 })
        .toBe(count + 2);
      await expect
        .poll(() => [...logs.matchAll(/DevTools listening on /gu)].length)
        .toBe(count + 2);
      current = await connect();
    }
    const count = electronPids().length;
    const logOffset = logs.length;
    const broken = edit(
      "packages/agent/src/runtime/stable-runtime-uuid.ts",
      true,
    );
    await expect
      .poll(() => logs.slice(logOffset).includes("[ERROR]"))
      .toBe(true);
    expect(electronPids()).toHaveLength(count);
    expect(
      await current.page.evaluate(
        async () => (await window.doolittle.getBackendState()).phase,
      ),
    ).toBe("ready");
    restore(broken);
    await expect
      .poll(() => electronPids().length, { timeout: 45_000 })
      .toBe(count + 1);
    await expect
      .poll(() => [...logs.matchAll(/DevTools listening on /gu)].length)
      .toBe(count + 1);
    await connect();
    // A valid build that crashes Electron must leave the watcher alive for a fix.
    const crashCount = electronPids().length;
    const crashEdit = {
      path: resolve(repoRoot, "apps/desktop/src/main/renderer-url.ts"),
      marker: `\n// dev-crash-acceptance ${randomUUID()}\nprocess.exit(1);\n`,
    };
    edits.push(crashEdit);
    appendFileSync(crashEdit.path, crashEdit.marker);
    await expect
      .poll(() => electronPids().length, { timeout: 45_000 })
      .toBe(crashCount + 1);
    await expect.poll(() => alive(electronPids().at(-1) as number)).toBe(false);
    expect(alive(supervisorPid())).toBe(true);
    const endpointCount = [...logs.matchAll(/DevTools listening on /gu)].length;
    restore(crashEdit);
    await expect
      .poll(() => electronPids().length, { timeout: 45_000 })
      .toBe(crashCount + 2);
    await expect
      .poll(() => [...logs.matchAll(/DevTools listening on /gu)].length)
      .toBeGreaterThan(endpointCount);
    await connect();
  } finally {
    const pid = supervisorPid();
    if (pid && alive(pid) && dev.pid) process.kill(-dev.pid, "SIGINT");
    try {
      await expect
        .poll(() => (pid ? alive(pid) : dev.exitCode !== null), {
          timeout: 45_000,
        })
        .toBe(false);
      for (const childPid of electronPids())
        expect(alive(childPid)).toBe(false);
    } finally {
      if (browser?.isConnected()) await browser.close();
      for (const entry of edits) restore(entry);
      if (
        !electronPids().some(alive) &&
        ![...observedRuntimePids].some(alive) &&
        (!pid || !alive(pid))
      )
        rmSync(profile, { recursive: true, force: true });
    }
  }
});

for (const phase of ["startup", "ready"] as const) {
  test(`terminal Ctrl+C during ${phase} closes the isolated dev app, runtime and watchers`, async () => {
    test.skip(
      process.platform === "win32",
      "This terminal signal acceptance uses POSIX process groups.",
    );
    const profile = mkdtempSync(resolve(tmpdir(), "doolittle-dev-terminal-"));
    const runtime = resolve(profile, "runtime");
    mkdirSync(runtime, { recursive: true });
    writeFileSync(
      resolve(runtime, "settings.json"),
      JSON.stringify({
        model: {
          provider: "offline",
          model: "offline",
          baseUrl: "",
          temperature: 0,
          maxTokens: 512,
        },
      }),
    );
    const dev = spawn(
      "nub",
      [
        resolve(repoRoot, "apps/desktop/scripts/dev.ts"),
        `--user-data-dir=${profile}`,
        "--remote-debugging-port=0",
      ],
      {
        cwd: repoRoot,
        detached: true,
        env: {
          ...isolatedRuntimeEnvironment(runtime),
          DOOLITTLE_DEV_PORT: "0",
          DOOLITTLE_DESKTOP_SOURCE_ROOT: repoRoot,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let logs = "";
    dev.stdout?.on("data", (chunk) => {
      logs += String(chunk);
    });
    dev.stderr?.on("data", (chunk) => {
      logs += String(chunk);
    });
    let browser: Browser | undefined;
    const pids = new Set<number>();
    const capturePids = () => {
      const supervisor = Number(
        /Supervisor started \(pid (\d+)\)/u.exec(logs)?.[1],
      );
      const electronPid = Number(
        /Electron started \(pid (\d+)\)/u.exec(logs)?.[1],
      );
      if (supervisor) pids.add(supervisor);
      if (electronPid) {
        pids.add(electronPid);
        for (const pid of ownedRuntimePids(electronPid)) pids.add(pid);
      }
    };
    try {
      await expect
        .poll(() => /Renderer hot reload at (http:\/\/\S+)/u.exec(logs)?.[1], {
          timeout: 45_000,
        })
        .toBeTruthy();
      if (phase === "ready") {
        await expect
          .poll(() => /DevTools listening on (ws:\/\/\S+)/u.exec(logs)?.[1], {
            timeout: 45_000,
          })
          .toBeTruthy();
        browser = await chromium.connectOverCDP(
          /DevTools listening on (ws:\/\/\S+)/u.exec(logs)?.[1] as string,
        );
        await expect
          .poll(() => browser?.contexts()[0]?.pages().length ?? 0)
          .toBeGreaterThan(0);
        const page = browser.contexts()[0]?.pages()[0] as Page;
        await expect
          .poll(
            () =>
              page.evaluate(
                async () => (await window.doolittle?.getBackendState())?.phase,
              ),
            { timeout: 60_000 },
          )
          .toBe("ready");
        const electronPid = Number(
          /Electron started \(pid (\d+)\)/u.exec(logs)?.[1],
        );
        expect(ownedRuntimePids(electronPid).length).toBeGreaterThan(0);
      }
      capturePids();
      expect(pids.size).toBeGreaterThan(0);
      process.kill(-(dev.pid as number), "SIGINT");
      await expect
        .poll(() => [...pids].some(alive), { timeout: 45_000 })
        .toBe(false);
      const url = /Renderer hot reload at (http:\/\/\S+)/u.exec(logs)?.[1];
      await expect(fetch(url as string)).rejects.toThrow();
    } finally {
      capturePids();
      if (dev.pid) {
        try {
          process.kill(-dev.pid, "SIGINT");
        } catch {}
      }
      await expect
        .poll(() => [...pids].some(alive), { timeout: 45_000 })
        .toBe(false);
      if (browser?.isConnected()) await browser.close();
      if (![...pids].some(alive))
        rmSync(profile, { recursive: true, force: true });
    }
  });
}
