import type { AppContext } from "@/runtime/bootstrap";
import { getNativeServices } from "@/runtime/native/service-bridge/runtime";
import { json } from "@/server/responses";

export async function handleContextDocumentRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/context/files") {
    return json({
      files: context.services.contextFiles.list(),
    });
  }

  if (request.method === "POST" && url.pathname === "/documents/pdf/extract") {
    const body = (await request.json()) as {
      path?: string;
      base64?: string;
      startPage?: number;
      endPage?: number;
      preserveWhitespace?: boolean;
      cleanContent?: boolean;
    };

    if (!body.path && !body.base64) {
      return json({ error: "path or base64 is required" }, 400);
    }

    const nativeServices = getNativeServices(context.runtime);
    const text = body.path
      ? nativeServices.knowledge?.extractPdf
        ? await nativeServices.knowledge.extractPdf(body.path)
        : await context.services.documents.extractPdfFromPath(body.path, {
            startPage: body.startPage,
            endPage: body.endPage,
            preserveWhitespace: body.preserveWhitespace,
            cleanContent: body.cleanContent,
          })
      : await context.services.documents.extractPdfFromBase64(
          body.base64 as string,
          {
            startPage: body.startPage,
            endPage: body.endPage,
            preserveWhitespace: body.preserveWhitespace,
            cleanContent: body.cleanContent,
          },
        );

    return json({ text });
  }

  return null;
}
