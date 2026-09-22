import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppServerManager, localAppUrls } from "./app-server";
import { shellQuote } from "./execution/subprocess/shell";
import {
  InteractiveTerminalSessionManager,
  type InteractiveTerminalSessionSnapshot,
} from "./session";

function fakeTerminal(
  text: string,
  state: InteractiveTerminalSessionSnapshot["state"] = "running",
) {
  const snapshot: InteractiveTerminalSessionSnapshot = {
    id: "11111111-1111-4111-8111-111111111111",
    cwd: tmpdir(),
    command: "bun run dev",
    state,
    shell: "zsh",
    cols: 100,
    rows: 30,
    startedAt: new Date().toISOString(),
    pty: true,
    supportsResize: true,
    outputBytes: text.length,
    managed: true,
    processId: 123,
  };
  return {
    start: vi.fn(() => snapshot),
    listManaged: vi.fn((): InteractiveTerminalSessionSnapshot[] => []),
    output: vi.fn(() => ({
      session: { ...snapshot },
      chunks: [{ cursor: 1, data: text }],
      nextCursor: 1,
      truncatedBeforeCursor: false,
    })),
    close: vi.fn(() => ({ ...snapshot, state: "closed" as const })),
  };
}

describe("managed application handoff", () => {
  it("extracts only actual loopback URLs and validates complete authorities and ports", () => {
    expect(
      localAppUrls(
        "\x1b[32mLocal: http://localhost:3001\x1b[0m\nhttp://127.0.0.1:4010/hello\nhttp://[::1]:4011/\nhttp://localhost:65536 http://localhost.evil:3000 http://localhost:3000.evil http://user:secret@localhost:3000 https://example.com",
      ),
    ).toEqual([
      "http://localhost:3001/",
      "http://127.0.0.1:4010/hello",
      "http://[::1]:4011/",
    ]);
  });

  it("never invents a localhost URL or calls readiness without an observed URL", async () => {
    const terminal = fakeTerminal("Booting...");
    const probe = vi.fn(async () => true);
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
      probe,
    );
    expect(
      await manager.start({
        owner: "chat-a",
        cwd: tmpdir(),
        command: "bun run dev",
        waitMs: 0,
      }),
    ).toMatchObject({ status: "starting" });
    expect(probe).not.toHaveBeenCalled();
  });

  it("requires HTTP readiness and rejects another chat's status/stop", async () => {
    const terminal = fakeTerminal("Local: http://localhost:3007");
    const probe = vi.fn(async () => false);
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
      probe,
    );
    const started = await manager.start({
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      waitMs: 0,
    });
    expect(started.status).toBe("starting");
    await expect(manager.status("chat-b", started.session.id)).rejects.toThrow(
      "current conversation",
    );
    expect(() => manager.stop("chat-b", started.session.id)).toThrow(
      "current conversation",
    );
    expect(terminal.close).not.toHaveBeenCalled();
    probe.mockResolvedValue(true);
    expect(await manager.status("chat-a", started.session.id)).toMatchObject({
      status: "ready",
      url: "http://localhost:3007/",
    });
    expect(manager.stop("chat-a", started.session.id).status).toBe("stopped");
  });

  it("does not call a previously printed URL ready after the command has exited", async () => {
    const terminal = fakeTerminal(
      "Local: http://localhost:3000\nEADDRINUSE",
      "exited",
    );
    const probe = vi.fn(async () => true);
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
      probe,
    );
    const result = await manager.start({
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      waitMs: 0,
    });
    expect(result.status).toBe("exited");
    expect(result.url).toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it("reuses the same conversation's live command instead of launching a duplicate on retry", async () => {
    const terminal = fakeTerminal("http://localhost:3007");
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
      async () => true,
    );
    const input = {
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      waitMs: 0,
    };
    const first = await manager.start(input);
    terminal.listManaged.mockReturnValue([
      {
        ...first.session,
        cwd: realpathSync(tmpdir()),
      },
    ]);
    const second = await manager.start(input);
    expect(second.session.id).toBe(first.session.id);
    expect(terminal.start).toHaveBeenCalledTimes(1);
  });

  it("keeps cancellation connected after a starting handoff, but detaches it once ready", async () => {
    const terminal = fakeTerminal("http://localhost:3007");
    const probe = vi.fn(async () => false);
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
      probe,
    );
    const controller = new AbortController();
    const first = await manager.start({
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      waitMs: 0,
      abortSignal: controller.signal,
    });
    expect(first.status).toBe("starting");
    controller.abort();
    expect(terminal.close).toHaveBeenCalled();

    terminal.close.mockClear();
    probe.mockResolvedValue(true);
    const nextController = new AbortController();
    await manager.start({
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      waitMs: 0,
      abortSignal: nextController.signal,
    });
    nextController.abort();
    expect(terminal.close).not.toHaveBeenCalled();
  });

  it("closes the started process when the parent is stopped during startup", async () => {
    const terminal = fakeTerminal("Booting...");
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
    );
    const controller = new AbortController();
    const pending = manager.start({
      owner: "chat-a",
      cwd: tmpdir(),
      command: "bun run dev",
      abortSignal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(terminal.close).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("rejects relative/missing paths and detached commands before creating a process", async () => {
    const terminal = fakeTerminal("");
    const manager = new AppServerManager(
      terminal as unknown as InteractiveTerminalSessionManager,
    );
    await expect(
      manager.start({
        owner: "chat-a",
        cwd: "somewhere",
        command: "bun run dev",
      }),
    ).rejects.toThrow("absolute");
    await expect(
      manager.start({
        owner: "chat-a",
        cwd: tmpdir(),
        command: "bun run dev &",
      }),
    ).rejects.toThrow("foreground");
    await expect(
      manager.start({ owner: "chat-a", cwd: tmpdir(), command: "" }),
    ).rejects.toThrow("explicit");
    expect(terminal.start).not.toHaveBeenCalled();
  });
});

describe.runIf(process.platform !== "win32")(
  "managed app real process lifecycle",
  () => {
    const directories: string[] = [];
    const terminals: InteractiveTerminalSessionManager[] = [];
    afterEach(() => {
      for (const terminal of terminals) terminal.dispose();
      for (const directory of directories)
        rmSync(directory, { recursive: true, force: true });
    });

    it.each(["stop", "shutdown"])(
      "keeps a real child HTTP server across navigation and terminates its process group on %s",
      async (operation) => {
        const directory = mkdtempSync(join(tmpdir(), "doolittle-managed-app-"));
        directories.push(directory);
        const terminal = new InteractiveTerminalSessionManager(directory);
        terminals.push(terminal);
        const manager = new AppServerManager(terminal);
        const child =
          "const server=require('node:http').createServer((req,res)=>res.end('managed-app-ok'));server.listen(0,'127.0.0.1',()=>console.log('http://127.0.0.1:'+server.address().port));";
        const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'inherit'});`;
        const result = await manager.start({
          owner: "chat-real",
          cwd: directory,
          command: `${shellQuote(process.execPath)} -e ${shellQuote(parent)}`,
          waitMs: 5000,
        });
        expect(result.status).toBe("ready");
        expect(result.session.processId).toBeGreaterThan(0);
        const url = result.url as string;
        expect(await (await fetch(url)).text()).toBe("managed-app-ok");
        terminal.dispose({ preserveManaged: true });
        expect(
          (await manager.status("chat-real", result.session.id)).status,
        ).toBe("ready");
        if (operation === "stop") manager.stop("chat-real", result.session.id);
        else terminal.dispose();
        await delay(300);
        await expect(
          fetch(url, { signal: AbortSignal.timeout(1000) }),
        ).rejects.toThrow();
      },
      10_000,
    );
  },
);
