export function compactSessionPreview(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (!normalized) return "";

  const embeddedResource = normalized.match(
    /\[Embedded resource:\s*(?<path>[^\]]+)\]/iu,
  );
  if (embeddedResource?.groups?.path) {
    const resourceName = fileName(embeddedResource.groups.path);
    const withoutPath = normalized
      .replace(embeddedResource[0], "")
      .replace(/\s{2,}/gu, " ")
      .trim();
    return withoutPath
      ? `${withoutPath} · ${resourceName}`
      : `Referenced ${resourceName}`;
  }

  return normalized.replace(
    /(?:file:\/\/)?\/(?:Users|private|tmp|var|home|Volumes)\/[^\s\]\\)"']+/gu,
    (path) => fileName(path),
  );
}

function fileName(path: string): string {
  const normalized = path.trim().replace(/[\\/]+$/u, "");
  return normalized.split(/[\\/]/u).pop() || "resource";
}
