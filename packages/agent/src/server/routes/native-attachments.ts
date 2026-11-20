import { isAbsolute } from "node:path";
import {
  ATTACHMENT_IMPORT_LIMITS,
  AttachmentImportError,
  importSelectedAttachments,
} from "@doolittle/storage/attachment-import";
import type { AppContext } from "../../runtime/bootstrap/index";
import { readJsonObjectBody } from "../request-body";
import { json } from "../responses";

export const NATIVE_ATTACHMENT_IMPORT = "/media/attachments/import";

/** Only the dedicated desktop policy may call this for an OS file-picker result. */
export async function handleNativeAttachmentRoute(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method !== "POST" || url.pathname !== NATIVE_ATTACHMENT_IMPORT)
    return null;
  const body = await readJsonObjectBody(request);
  if (!body.ok)
    return json({ error: "A valid file selection is required." }, 400);
  const paths = body.value.paths;
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    paths.length > ATTACHMENT_IMPORT_LIMITS.maxCount ||
    paths.some(
      (path) =>
        typeof path !== "string" || path.length > 4096 || !isAbsolute(path),
    )
  )
    return json({ error: "A valid file selection is required." }, 400);
  try {
    request.signal.throwIfAborted();
    return json({
      attachments: importSelectedAttachments(paths, context.config.dataDir),
    });
  } catch (error) {
    if (error instanceof AttachmentImportError)
      return json({ error: error.message, code: error.code }, 400);
    throw error;
  }
}
