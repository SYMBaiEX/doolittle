import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runInheritedTextProcess } from "@/services/process-execution";

const NATIVE_TOOL_NAME = "doolittle-probe";

export interface NativeToolPaths {
  compilerPath: string;
  sourcePath: string;
  outputPath: string;
}

export interface NativeToolCommandResult {
  exitCode: number;
  message?: string;
}

interface NativeToolCommandDeps {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  runProcess: typeof runInheritedTextProcess;
}

const nativeToolCommandDeps: NativeToolCommandDeps = {
  existsSync,
  mkdirSync,
  runProcess: runInheritedTextProcess,
};

export function resolveNativeToolPaths(
  repoRoot: string,
  platform: NodeJS.Platform = process.platform,
): NativeToolPaths {
  const windows = platform === "win32";
  return {
    compilerPath: resolve(
      repoRoot,
      "node_modules",
      ".bin",
      windows ? "scriptc.cmd" : "scriptc",
    ),
    sourcePath: resolve(
      repoRoot,
      "packages",
      "agent",
      "src",
      "native-tools",
      "doolittle-probe.ts",
    ),
    outputPath: resolve(
      repoRoot,
      "dist",
      "native",
      windows ? `${NATIVE_TOOL_NAME}.exe` : NATIVE_TOOL_NAME,
    ),
  };
}

export function renderNativeToolHelp(): string {
  return [
    "Doolittle native tools",
    "",
    "  doolittle native status              Show compiler and artifact readiness",
    "  doolittle native coverage            Verify the probe is fully static",
    "  doolittle native build               Build the native health probe",
    "  doolittle native probe [base-url]    Run the built probe",
    "",
    "Only Doolittle-owned utilities are compiled. ElizaOS remains the runtime owner.",
  ].join("\n");
}

export async function runNativeToolCommand(
  input: {
    repoRoot: string;
    args: string[];
    platform?: NodeJS.Platform;
    printLine?: (message: string) => void;
  },
  deps: NativeToolCommandDeps = nativeToolCommandDeps,
): Promise<NativeToolCommandResult> {
  const printLine = input.printLine ?? console.log;
  const paths = resolveNativeToolPaths(input.repoRoot, input.platform);
  const action = input.args[0] ?? "status";

  if (action === "help" || action === "--help" || action === "-h") {
    printLine(renderNativeToolHelp());
    return { exitCode: 0 };
  }

  if (action === "status") {
    printLine(
      [
        "Doolittle native tools",
        `  source:   ${deps.existsSync(paths.sourcePath) ? "ready" : "missing"}`,
        `  compiler: ${deps.existsSync(paths.compilerPath) ? "ready" : "missing"}`,
        `  probe:    ${deps.existsSync(paths.outputPath) ? "built" : "not built"}`,
        `  output:   ${paths.outputPath}`,
      ].join("\n"),
    );
    return { exitCode: 0 };
  }

  if (action === "coverage" || action === "build") {
    if (input.args.length > 1) {
      return {
        exitCode: 1,
        message: `The native ${action} command does not accept additional arguments.`,
      };
    }
    if (!deps.existsSync(paths.compilerPath)) {
      return {
        exitCode: 1,
        message:
          "ScriptC is not installed. Run `nub install` from the repository root.",
      };
    }
    if (!deps.existsSync(paths.sourcePath)) {
      return {
        exitCode: 1,
        message: `Native source is missing: ${paths.sourcePath}`,
      };
    }

    if (action === "coverage") {
      const result = await deps.runProcess(
        paths.compilerPath,
        ["coverage", paths.sourcePath],
        {
          cwd: input.repoRoot,
          toolName: "doolittle.native.coverage",
        },
      );
      return { exitCode: result.exitCode };
    }

    deps.mkdirSync(dirname(paths.outputPath), { recursive: true });
    const result = await deps.runProcess(
      paths.compilerPath,
      [
        "build",
        paths.sourcePath,
        "--backend",
        "llvm",
        "--no-keep-c",
        "--out",
        paths.outputPath,
      ],
      {
        cwd: input.repoRoot,
        toolName: "doolittle.native.build",
      },
    );
    return { exitCode: result.exitCode };
  }

  if (action === "probe") {
    if (input.args.length > 2) {
      return {
        exitCode: 1,
        message: "Usage: doolittle native probe [base-url]",
      };
    }
    if (!deps.existsSync(paths.outputPath)) {
      return {
        exitCode: 1,
        message:
          "Native probe is not built. Run `doolittle native build` first.",
      };
    }
    const result = await deps.runProcess(
      paths.outputPath,
      input.args.slice(1),
      {
        cwd: input.repoRoot,
        toolName: "doolittle.native.probe",
      },
    );
    return { exitCode: result.exitCode };
  }

  return {
    exitCode: 1,
    message: `Unknown native command: ${action}\n\n${renderNativeToolHelp()}`,
  };
}
