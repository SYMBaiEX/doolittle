import { stdin as input, stdout as output } from "node:process";

export function supportsInteractiveMenus(): boolean {
  return Boolean(input.isTTY && output.isTTY && input.setRawMode);
}

export function clearRenderedMenu(lines: number): void {
  if (lines <= 0) {
    return;
  }
  output.write(`\u001b[${lines}F`);
  output.write("\u001b[J");
}

export function readMenuKeypress(): Promise<string> {
  return new Promise((resolve, reject) => {
    const onData = (chunk: Buffer | string) => {
      cleanup();
      resolve(chunk.toString());
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      input.off("data", onData);
      input.off("error", onError);
    };
    input.on("data", onData);
    input.on("error", onError);
  });
}

export async function withRawMenuInput<T>(run: () => Promise<T>): Promise<T> {
  if (!supportsInteractiveMenus()) {
    return run();
  }

  output.write("\u001b[?25l");
  input.setRawMode?.(true);
  input.resume();
  try {
    return await run();
  } finally {
    input.setRawMode?.(false);
    output.write("\u001b[?25h");
  }
}
