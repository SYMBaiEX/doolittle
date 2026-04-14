export type CliStartMode = "plain" | "tui";

export function resolveCliStartMode(input: {
  argv: string[];
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
}): CliStartMode {
  const forcePlain = input.argv.includes("--plain-cli");
  const forceCockpit =
    input.argv.includes("--cockpit") || input.argv.includes("--cli");
  const canUseTui =
    input.stdinIsTTY === true &&
    input.stdoutIsTTY === true &&
    forceCockpit &&
    !forcePlain;

  return canUseTui ? "tui" : "plain";
}
