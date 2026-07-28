import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runInheritedTextProcess } from "@/services/process-execution";

export interface DesktopCommandOptions {
  source: boolean;
  buildOnly: boolean;
  skipBuild: boolean;
  forceBuild: boolean;
  help: boolean;
}

export interface DesktopCommandResult {
  exitCode: number;
  message?: string;
}

type DesktopCommandRunner = (
  command: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    toolName: string;
  },
) => Promise<{ exitCode: number }> | { exitCode: number };

export function renderDesktopCommandHelp(): string {
  return [
    "Usage: doolittle desktop [options]",
    "",
    "Build and open the native Doolittle desktop application.",
    "",
    "Options:",
    "  --source       Launch the Electron development workspace",
    "  --build-only   Build the packaged app without opening it",
    "  --skip-build   Open an existing unpacked app",
    "  --force-build  Rebuild even when an unpacked app already exists",
    "  --help, -h     Show this help",
  ].join("\n");
}

export function parseDesktopCommandOptions(
  args: string[],
): DesktopCommandOptions {
  const options: DesktopCommandOptions = {
    source: false,
    buildOnly: false,
    skipBuild: false,
    forceBuild: false,
    help: false,
  };
  for (const argument of args) {
    if (argument === "--source") options.source = true;
    else if (argument === "--build-only") options.buildOnly = true;
    else if (argument === "--skip-build") options.skipBuild = true;
    else if (argument === "--force-build") options.forceBuild = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown desktop option: ${argument}`);
  }
  if (options.skipBuild && options.forceBuild) {
    throw new Error("--skip-build and --force-build cannot be used together.");
  }
  return options;
}

export function desktopExecutableCandidates(
  desktopDir: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): string[] {
  if (platform === "darwin") {
    return [
      resolve(
        desktopDir,
        "release",
        `mac-${arch}`,
        "Doolittle.app",
        "Contents",
        "MacOS",
        "Doolittle",
      ),
      resolve(
        desktopDir,
        "release",
        "mac",
        "Doolittle.app",
        "Contents",
        "MacOS",
        "Doolittle",
      ),
    ];
  }
  if (platform === "win32") {
    return [
      resolve(desktopDir, "release", `win-${arch}-unpacked`, "Doolittle.exe"),
      resolve(desktopDir, "release", "win-unpacked", "Doolittle.exe"),
    ];
  }
  return [
    resolve(desktopDir, "release", `linux-${arch}-unpacked`, "Doolittle"),
    resolve(desktopDir, "release", "linux-unpacked", "Doolittle"),
  ];
}

export function findDesktopExecutable(
  desktopDir: string,
  pathExists: (path: string) => boolean = existsSync,
): string | undefined {
  return desktopExecutableCandidates(desktopDir).find(pathExists);
}

export function buildDesktopLaunchEnvironment(
  baseEnvironment: NodeJS.ProcessEnv,
  sourceRoot: string,
  launchCwd: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...baseEnvironment,
    DOOLITTLE_DESKTOP_SOURCE_ROOT: sourceRoot,
    DOOLITTLE_DESKTOP_CWD: launchCwd,
  };

  // Packaged Electron rejects most NODE_OPTIONS values before the main process
  // starts. Doolittle owns this process boundary, so do not leak host tooling
  // hooks (debuggers, loaders, require hooks) into the desktop application.
  delete environment.NODE_OPTIONS;
  return environment;
}

export async function runDesktopCommand(
  input: {
    repoRoot: string;
    args: string[];
    launchCwd?: string;
    printLine?: (message: string) => void;
  },
  dependencies: {
    pathExists?: (path: string) => boolean;
    run?: DesktopCommandRunner;
    executable?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<DesktopCommandResult> {
  const printLine = input.printLine ?? console.log;
  let options: DesktopCommandOptions;
  try {
    options = parseDesktopCommandOptions(input.args);
  } catch (error) {
    return {
      exitCode: 1,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (options.help) {
    printLine(renderDesktopCommandHelp());
    return { exitCode: 0 };
  }

  const desktopDir = resolve(input.repoRoot, "apps", "desktop");
  const packageJson = resolve(desktopDir, "package.json");
  const pathExists = dependencies.pathExists ?? existsSync;
  if (!pathExists(packageJson)) {
    return {
      exitCode: 1,
      message: `Desktop application source not found at ${desktopDir}.`,
    };
  }

  const run = dependencies.run ?? runInheritedTextProcess;
  const localNub = resolve(
    input.repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "nub.cmd" : "nub",
  );
  const executable =
    dependencies.executable ?? (pathExists(localNub) ? localNub : "nub");
  const env = buildDesktopLaunchEnvironment(
    dependencies.env ?? process.env,
    input.repoRoot,
    input.launchCwd ?? process.cwd(),
  );

  if (options.source) {
    const script = options.buildOnly ? "build" : "dev";
    printLine(
      options.buildOnly
        ? "→ Building Doolittle Desktop from source…"
        : "→ Launching Doolittle Desktop from source…",
    );
    const result = await run(executable, ["run", "--cwd", desktopDir, script], {
      cwd: input.repoRoot,
      env,
      toolName: "doolittle.desktop.source",
    });
    return { exitCode: result.exitCode };
  }

  let desktopExecutable = findDesktopExecutable(desktopDir, pathExists);
  if (options.forceBuild || (!options.skipBuild && !desktopExecutable)) {
    printLine("→ Building the self-contained Doolittle Desktop app…");
    const build = await run(
      executable,
      ["run", "--cwd", desktopDir, "package:dir"],
      {
        cwd: input.repoRoot,
        env,
        toolName: "doolittle.desktop.package",
      },
    );
    if (build.exitCode !== 0) {
      return {
        exitCode: build.exitCode,
        message: "Doolittle Desktop build failed.",
      };
    }
    desktopExecutable = findDesktopExecutable(desktopDir, pathExists);
  }

  if (!desktopExecutable) {
    return {
      exitCode: 1,
      message:
        "No packaged desktop app was found. Retry without --skip-build or use --force-build.",
    };
  }
  if (options.buildOnly) {
    printLine(`✓ Doolittle Desktop is ready at ${desktopExecutable}`);
    return { exitCode: 0 };
  }

  printLine(`→ Opening Doolittle Desktop: ${desktopExecutable}`);
  const launch = await run(desktopExecutable, [], {
    cwd: input.launchCwd ?? process.cwd(),
    env,
    toolName: "doolittle.desktop.launch",
  });
  return { exitCode: launch.exitCode };
}
