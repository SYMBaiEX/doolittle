export function joinMediaLines(lines: Array<string | undefined>): string {
  return lines.filter((line): line is string => line !== undefined).join("\n");
}

export function listMediaLines(values: string[]): string[] {
  return values.length ? values.map((value) => `- ${value}`) : ["- none"];
}

export function formatOptionalMediaNumber(
  value?: number,
  suffix = "",
): string | undefined {
  return value !== undefined ? `${value}${suffix}` : undefined;
}
