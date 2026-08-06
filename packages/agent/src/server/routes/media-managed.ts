import { isPlainObject } from "@elizaos/shared/type-guards";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";
import {
  ManagedAttachmentError,
  resolveManagedAttachmentPath,
} from "@/services/chat-attachments";

const ALLOWED_BODY_KEYS = new Set([
  "attachmentId",
  "language",
  "prompt",
  "name",
]);

function optionalString(
  value: unknown,
  label: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > maxLength
  ) {
    throw new TypeError(`${label} is invalid`);
  }
  return value;
}

export async function handleManagedMediaRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (
    request.method !== "POST" ||
    url.pathname !== "/media/transcribe-attachment"
  ) {
    return null;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "A valid JSON body is required." }, 400);
  }
  if (
    !isPlainObject(body) ||
    Object.keys(body).some((key) => !ALLOWED_BODY_KEYS.has(key))
  ) {
    return json(
      {
        error: "Only attachmentId, language, prompt, and name are accepted.",
      },
      400,
    );
  }

  try {
    const attachmentId = optionalString(body.attachmentId, "attachmentId", 36);
    if (!attachmentId) {
      return json({ error: "attachmentId is required" }, 400);
    }
    const language = optionalString(body.language, "language", 64);
    const prompt = optionalString(body.prompt, "prompt", 4_096);
    const name = optionalString(body.name, "name", 180);
    const attachment = await resolveManagedAttachmentPath({
      dataDir: context.config.dataDir,
      attachmentId,
    });
    if (attachment.descriptor.kind !== "audio") {
      return json(
        {
          error: "The managed attachment is not audio.",
          code: "unsupported_attachment",
        },
        400,
      );
    }

    const result = await context.services.media.transcribeWithModel(
      attachment.path,
      { language, prompt, name },
    );
    return json({
      attachment: attachment.descriptor,
      transcription: {
        transcriptText: result.transcriptText,
        model: result.model,
        provider: result.provider,
        source: result.source,
      },
    });
  } catch (error) {
    if (error instanceof ManagedAttachmentError) {
      return json({ error: error.message, code: error.code }, 400);
    }
    if (error instanceof TypeError) {
      return json({ error: error.message }, 400);
    }
    throw error;
  }
}
