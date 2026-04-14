import { parseDelimitedOptions } from "./shared";

export function parseDelegationMetadata(
  value?: string,
): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  const metadata = parseDelimitedOptions(
    value.split(",").map((pair) => pair.trim()),
    "=",
  );
  return Object.keys(metadata).length ? metadata : undefined;
}

export function parseDelegationLabels(value?: string): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const labels = value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);

  return labels.length ? labels : [];
}
