import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopLaunchEnvironment,
  desktopExecutableCandidates,
  desktopLaunchTarget,
  parseDesktopCommandOptions,
  runDesktopCommand,
} from "./desktop-command";

describe("desktop command", () => {
  it("parses the supported launch modes", () => {
    expect(
      parseDesktopCommandOptions(["--build-only", "--force-build"]),
    ).toMatchObject({
      buildOnly: true,
      forceBuild: true,
    });
    expect(() =>
      parseDesktopCommandOptions(["--skip-build", "--force-build"]),
    ).toThrow();
  });

  it("resolves unpacked app executables for every supported OS", () => {
    expect(
      desktopExecutableCandidates("/repo/apps/desktop", "darwin", "arm64"),
    ).toContain(
      "/repo/apps/desktop/release/mac-arm64/Doolittle.app/Contents/MacOS/Doolittle",
    );
    expect(
      desktopExecutableCandidates("/repo/apps/desktop", "win32", "x64"),
    ).toContain("/repo/apps/desktop/release/win-x64-unpacked/Doolittle.exe");
    expect(
      desktopExecutableCandidates("/repo/apps/desktop", "linux", "x64"),
    ).toContain("/repo/apps/desktop/release/linux-x64-unpacked/Doolittle");
  });

  it("does not leak host NODE_OPTIONS into Electron", () => {
    expect(
      buildDesktopLaunchEnvironment(
        {
          NODE_OPTIONS: "--require /tmp/host-hook.cjs",
          SAFE_VALUE: "preserved",
        },
        "/repo",
        "/workspace",
      ),
    ).toEqual({
      SAFE_VALUE: "preserved",
      DOOLITTLE_DESKTOP_SOURCE_ROOT: "/repo",
      DOOLITTLE_DESKTOP_CWD: "/workspace",
    });
  });

  it("clears NODE_OPTIONS at the packaged executable boundary", () => {
    expect(
      desktopLaunchTarget("/Applications/Doolittle.app", "darwin"),
    ).toEqual({
      command: "/usr/bin/env",
      args: ["-u", "NODE_OPTIONS", "/Applications/Doolittle.app"],
    });
    expect(
      desktopLaunchTarget("C:\\Program Files\\Doolittle.exe", "win32"),
    ).toEqual({
      command: "cmd.exe",
      args: [
        "/d",
        "/s",
        "/c",
        'set "NODE_OPTIONS=" && "C:\\Program Files\\Doolittle.exe"',
      ],
    });
  });

  it("builds a missing packaged app and forwards the source root", async () => {
    const run = vi.fn((command: string, args: string[]) => {
      expect(command).toBe("/mock/nub");
      expect(args).toEqual([
        "run",
        "--cwd",
        "/repo/apps/desktop",
        "package:dir",
      ]);
      return { exitCode: 0 };
    });
    let executableChecks = 0;
    const result = await runDesktopCommand(
      {
        repoRoot: "/repo",
        args: ["--build-only"],
        launchCwd: "/workspace",
      },
      {
        executable: "/mock/nub",
        pathExists: (path) => {
          if (path.endsWith("package.json")) return true;
          executableChecks += 1;
          return executableChecks > 2;
        },
        run: run as never,
        env: {},
      },
    );
    expect(result.exitCode).toBe(0);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
