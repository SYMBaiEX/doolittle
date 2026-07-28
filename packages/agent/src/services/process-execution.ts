import {
  type ChildProcessByStdio,
  type SpawnOptions,
  spawn,
} from "node:child_process";
import type { Readable } from "node:stream";

export interface TextProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type TextChildProcess = ChildProcessByStdio<null, Readable, Readable>;

export function spawnTextProcess(
  command: string,
  args: string[],
  options: Omit<SpawnOptions, "stdio"> = {},
): {
  child: TextChildProcess;
  completed: Promise<TextProcessResult>;
} {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const completed = new Promise<TextProcessResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
  return { child, completed };
}
