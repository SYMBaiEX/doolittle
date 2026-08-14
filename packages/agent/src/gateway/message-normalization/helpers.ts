import type { ContentType, Media } from "@elizaos/core";

export interface AttachmentDescriptor {
  id?: string;
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

function contentTypeForAttachment(
  kind: AttachmentDescriptor["kind"],
): ContentType {
  if (kind === "photo" || kind === "image" || kind === "sticker") {
    return "image";
  }
  if (kind === "video" || kind === "animation") {
    return "video";
  }
  if (kind === "audio" || kind === "voice") {
    return "audio";
  }
  return "document";
}

function finiteNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function mediaUrl(source: string, descriptor: AttachmentDescriptor): string {
  if (
    (source === "telegram" || source === "whatsapp") &&
    descriptor.id === descriptor.url
  ) {
    return `attachment://${encodeURIComponent(descriptor.id ?? descriptor.url ?? "")}`;
  }

  return descriptor.url ?? "";
}

function hasOpaqueOrAuthenticatedLocator(source: string, url: string): boolean {
  return (
    source === "slack" ||
    source === "telegram" ||
    source === "whatsapp" ||
    source === "matrix" ||
    (!url.startsWith("https://") &&
      !url.startsWith("http://") &&
      !url.startsWith("data:"))
  );
}

export function attachmentFallbackText(
  platform: string,
  descriptors: AttachmentDescriptor[],
): string | undefined {
  if (descriptors.length === 0) return undefined;
  const labels = descriptors
    .map((descriptor) => descriptor.caption ?? descriptor.name)
    .filter((label): label is string => Boolean(label?.trim()));
  const subject = labels.length > 0 ? `: ${labels.join(", ")}` : "";

  switch (platform) {
    case "discord":
      return `Discord attachment${descriptors.length === 1 ? "" : "s"}${subject}`;
    case "slack":
      return `Slack file${descriptors.length === 1 ? "" : "s"}${subject}`;
    case "signal":
      return `Signal attachment${descriptors.length === 1 ? "" : "s"}${subject}`;
    case "whatsapp":
      return `WhatsApp attachment${descriptors.length === 1 ? "" : "s"}${subject}`;
    case "matrix":
      return `Matrix attachment${descriptors.length === 1 ? "" : "s"}${subject}`;
    case "sms":
      return `MMS attachment${descriptors.length === 1 ? "" : "s"}${subject}`;
    default:
      return `Attachment${subject}`;
  }
}

/**
 * Converts connector attachment facts into Eliza's structured media primitive.
 * Metadata remains a backwards-compatible summary only; it is never read back.
 */
export function attachmentMedia(
  source: string,
  descriptors: AttachmentDescriptor[],
): Media[] | undefined {
  const attachments = descriptors.flatMap((descriptor) => {
    if (!descriptor.url) return [];

    return [
      {
        id: descriptor.id ?? descriptor.url,
        url: mediaUrl(source, descriptor),
        title: descriptor.name,
        source,
        description: descriptor.caption,
        contentType: contentTypeForAttachment(descriptor.kind),
        mimeType: descriptor.mimeType,
        filename: descriptor.name,
        size: finiteNumber(descriptor.size),
        width: finiteNumber(descriptor.width),
        height: finiteNumber(descriptor.height),
        duration: (() => {
          const durationMs = finiteNumber(descriptor.durationMs);
          return durationMs === undefined ? undefined : durationMs / 1000;
        })(),
        ephemeral: hasOpaqueOrAuthenticatedLocator(source, descriptor.url),
      } satisfies Media,
    ];
  });

  return attachments.length > 0 ? attachments : undefined;
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
