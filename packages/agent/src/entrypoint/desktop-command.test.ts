import { describe, expect, it, mock } from "bun:test";
import {
  desktopExecutableCandidates,
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

  it("builds a missing packaged app and forwards the source root", () => {
    const run = mock((command: string, args: string[]) => {
      expect(command).toBe("/mock/bun");
      expect(args).toEqual([
        "run",
        "--cwd",
        "/repo/apps/desktop",
        "package:dir",
      ]);
      return { status: 0 };
    });
    let executableChecks = 0;
    const result = runDesktopCommand(
      {
        repoRoot: "/repo",
        args: ["--build-only"],
        launchCwd: "/workspace",
      },
      {
        executable: "/mock/bun",
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
