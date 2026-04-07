export interface AttachmentDescriptor {
  kind?: string;
  name?: string;
  url?: string;
  mimeType?: string;
  size?: string;
  caption?: string;
  durationMs?: string;
  width?: string;
  height?: string;
}

export function normalizeMetadata(
  entries: Array<[string, string | undefined | null]>,
): Record<string, string> {
  return Object.fromEntries(
    entries.filter(([, value]) => Boolean(value)),
  ) as Record<string, string>;
}

export function joinAttachmentValues(
  values: Array<string | undefined | null>,
): string | undefined {
  const filtered = values.filter((value): value is string => Boolean(value));
  return filtered.length > 0 ? filtered.join("|") : undefined;
}

export function attachmentMetadata(
  descriptors: AttachmentDescriptor[],
): Record<string, string> {
  if (descriptors.length === 0) {
    return {};
  }

  return normalizeMetadata([
    ["attachmentCount", String(descriptors.length)],
    [
      "attachmentKinds",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.kind)),
    ],
    [
      "attachmentNames",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.name)),
    ],
    [
      "attachmentUrls",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.url)),
    ],
    [
      "attachmentMimeTypes",
      joinAttachmentValues(
        descriptors.map((descriptor) => descriptor.mimeType),
      ),
    ],
    [
      "attachmentSizes",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.size)),
    ],
    [
      "attachmentCaptions",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.caption)),
    ],
    [
      "attachmentDurationsMs",
      joinAttachmentValues(
        descriptors.map((descriptor) => descriptor.durationMs),
      ),
    ],
    [
      "attachmentWidths",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.width)),
    ],
    [
      "attachmentHeights",
      joinAttachmentValues(descriptors.map((descriptor) => descriptor.height)),
    ],
  ]);
}
