import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, resolve } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTrustedProviderAuthUrl,
  ProviderAuthController,
  providerAuthUrls,
  resolveProviderAuthExecutable,
} from "./provider-auth";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function executableDirectory(name: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), "doolittle-auth-"));
  temporaryDirectories.push(directory);
  const executable = resolve(directory, name);
  writeFileSync(executable, "#!/bin/sh\n");
  chmodSync(executable, 0o755);
  return directory;
}

function mockChildProcess(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.assign(child, {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  return child;
}

describe("provider auth", () => {
  it("resolves provider CLIs from a bounded desktop PATH", () => {
    const directory = executableDirectory("codex");
    expect(
      resolveProviderAuthExecutable("codex", {
        environment: { PATH: directory },
        platform: "darwin",
        homeDirectory: "/missing",
      }),
    ).toBe(resolve(directory, "codex"));
    expect(delimiter).toBeTruthy();
  });

  it("only accepts official provider login destinations", () => {
    expect(
      isTrustedProviderAuthUrl(
        "codex",
        "https://auth.openai.com/oauth/authorize",
      ),
    ).toBe(true);
    expect(
      isTrustedProviderAuthUrl(
        "claude-code",
        "https://claude.ai/oauth/authorize",
      ),
    ).toBe(true);
    expect(
      isTrustedProviderAuthUrl("codex", "https://openai.com.attacker.test"),
    ).toBe(false);
    expect(
      providerAuthUrls(
        "codex",
        "Open https://auth.openai.com/oauth/authorize?state=opaque).",
      ),
    ).toEqual(["https://auth.openai.com/oauth/authorize?state=opaque"]);
  });

  it("opens the official browser URL without exposing it in renderer state", async () => {
    const directory = executableDirectory("codex");
    const child = mockChildProcess();
    const openExternal = vi.fn(async () => undefined);
    const controller = new ProviderAuthController({
      environment: { PATH: directory },
      platform: "darwin",
      homeDirectory: directory,
      openExternal,
      spawn: () => child,
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });

    expect(controller.start("codex").phase).toBe("launching");
    child.emit("spawn");
    child.stdout?.emit(
      "data",
      Buffer.from(
        "Continue in your browser: https://auth.openai.com/oauth/authorize?state=secret\n",
      ),
    );
    await Promise.resolve();

    expect(openExternal).toHaveBeenCalledWith(
      "https://auth.openai.com/oauth/authorize?state=secret",
    );
    expect(controller.getState("codex")).toMatchObject({
      phase: "waiting",
      browserOpened: true,
    });
    expect(JSON.stringify(controller.getState("codex"))).not.toContain(
      "state=secret",
    );

    child.emit("exit", 0, null);
    expect(controller.getState("codex").phase).toBe("succeeded");
  });
});
