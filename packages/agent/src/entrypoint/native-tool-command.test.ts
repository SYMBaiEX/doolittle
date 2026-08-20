import { describe, expect, it, vi } from "vitest";
import {
  resolveNativeToolPaths,
  runNativeToolCommand,
} from "./native-tool-command";

function createDeps(overrides: Record<string, unknown> = {}) {
  return {
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(() => undefined),
    runProcess: vi.fn(async () => ({ exitCode: 0 })),
    ...overrides,
  };
}

describe("Doolittle native tool command", () => {
  it("resolves only the repository-owned probe and local compiler", () => {
    expect(resolveNativeToolPaths("/repo", "darwin")).toEqual({
      compilerPath: "/repo/node_modules/.bin/scriptc",
      sourcePath: "/repo/packages/agent/src/native-tools/doolittle-probe.ts",
      outputPath: "/repo/dist/native/doolittle-probe",
    });
    expect(resolveNativeToolPaths("C:\\repo", "win32")).toMatchObject({
      compilerPath: expect.stringContaining("scriptc.cmd"),
      outputPath: expect.stringContaining("doolittle-probe.exe"),
    });
  });

  it("builds the fixed Doolittle source with the static LLVM backend", async () => {
    const deps = createDeps();
    const result = await runNativeToolCommand(
      { repoRoot: "/repo", args: ["build"], platform: "darwin" },
      deps as never,
    );

    expect(result).toEqual({ exitCode: 0 });
    expect(deps.mkdirSync).toHaveBeenCalledWith("/repo/dist/native", {
      recursive: true,
    });
    expect(deps.runProcess).toHaveBeenCalledWith(
      "/repo/node_modules/.bin/scriptc",
      [
        "build",
        "/repo/packages/agent/src/native-tools/doolittle-probe.ts",
        "--backend",
        "llvm",
        "--no-keep-c",
        "--out",
        "/repo/dist/native/doolittle-probe",
      ],
      expect.objectContaining({ toolName: "doolittle.native.build" }),
    );
  });

  it("fails safely when the optional compiler or artifact is missing", async () => {
    const missing = createDeps({ existsSync: vi.fn(() => false) });
    await expect(
      runNativeToolCommand(
        { repoRoot: "/repo", args: ["coverage"], platform: "darwin" },
        missing as never,
      ),
    ).resolves.toEqual({
      exitCode: 1,
      message:
        "ScriptC is not installed. Run `nub install` from the repository root.",
    });
    await expect(
      runNativeToolCommand(
        { repoRoot: "/repo", args: ["probe"], platform: "darwin" },
        missing as never,
      ),
    ).resolves.toEqual({
      exitCode: 1,
      message: "Native probe is not built. Run `doolittle native build` first.",
    });
  });

  it("runs only the built native probe and forwards one optional URL", async () => {
    const deps = createDeps();
    await runNativeToolCommand(
      {
        repoRoot: "/repo",
        args: ["probe", "http://127.0.0.1:4312"],
        platform: "darwin",
      },
      deps as never,
    );

    expect(deps.runProcess).toHaveBeenCalledWith(
      "/repo/dist/native/doolittle-probe",
      ["http://127.0.0.1:4312"],
      expect.objectContaining({ toolName: "doolittle.native.probe" }),
    );
  });
});
