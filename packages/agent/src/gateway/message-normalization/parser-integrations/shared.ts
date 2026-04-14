import type { AttachmentDescriptor } from "../helpers";

export function resolveAttachmentKind(mimeType?: string): string {
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

export function buildAttachmentDescriptor(
  descriptor: Omit<AttachmentDescriptor, "kind"> & { mimeType?: string },
): AttachmentDescriptor {
  return {
    kind: resolveAttachmentKind(descriptor.mimeType),
    ...descriptor,
  };
}
