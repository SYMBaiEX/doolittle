export type CliStartMode = "plain" | "tui";

export function resolveCliStartMode(input: {
  argv: string[];
  requestedMode?: CliStartMode;
  stdinIsTTY: boolean | undefined;
  stdoutIsTTY: boolean | undefined;
}): CliStartMode {
  const forcePlain =
    input.requestedMode === "plain" || input.argv.includes("--plain-cli");
  const forceCockpit =
    input.requestedMode === "tui" ||
    input.argv.includes("--cockpit") ||
    input.argv.includes("--cli");
  const canUseTui =
    input.stdinIsTTY === true &&
    input.stdoutIsTTY === true &&
    forceCockpit &&
    !forcePlain;

  return canUseTui ? "tui" : "plain";
}
