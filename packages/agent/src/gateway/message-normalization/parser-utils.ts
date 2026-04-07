import type { AttachmentDescriptor } from "./helpers";

export function inferMimeAttachmentKind(
  mimeType?: string,
): AttachmentDescriptor["kind"] {
  if (mimeType?.startsWith("image/")) {
    return "image";
  }
  if (mimeType?.startsWith("video/")) {
    return "video";
  }
  if (mimeType?.startsWith("audio/")) {
    return "audio";
  }
  return "file";
}

export function optionalNumericString(value?: number): string | undefined {
  return value ? String(value) : undefined;
}

export function optionalDurationMs(seconds?: number): string | undefined {
  return seconds ? String(seconds * 1000) : undefined;
}

export function authorDisplayName(
  username?: string,
  firstName?: string,
  lastName?: string,
): string | undefined {
  return (
    username ??
    ([firstName, lastName].filter(Boolean).join(" ").trim() || undefined)
  );
}

export function buildMimeAttachment(input: {
  name?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  width?: number;
  height?: number;
  kind?: AttachmentDescriptor["kind"];
}): AttachmentDescriptor | null {
  if (!input.url) {
    return null;
  }

  return {
    kind: input.kind ?? inferMimeAttachmentKind(input.mimeType),
    name: input.name,
    url: input.url,
    mimeType: input.mimeType,
    size: optionalNumericString(input.size),
    width: optionalNumericString(input.width),
    height: optionalNumericString(input.height),
  };
}
