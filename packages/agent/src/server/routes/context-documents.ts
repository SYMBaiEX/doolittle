import { isPlainObject } from "@elizaos/shared/type-guards";
import type { AppContext } from "@/runtime/bootstrap";
import { json } from "@/server/responses";

const PDF_BODY_KEYS = new Set([
  "path",
  "base64",
  "startPage",
  "endPage",
  "preserveWhitespace",
  "cleanContent",
]);
const MAX_PDF_PATH_LENGTH = 4_096;
const MAX_PDF_BASE64_LENGTH = 1_000_000;
const MAX_PDF_PAGE = 100_000;

function optionalPdfPage(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < 1 ||
    (value as number) > MAX_PDF_PAGE
  ) {
    throw new TypeError(`${label} must be a positive page number.`);
  }
  return value as number;
}

function optionalPdfBoolean(
  value: unknown,
  label: string,
): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be boolean.`);
  }
  return value;
}

function parsePdfExtractionRequest(body: Record<string, unknown>) {
  const path =
    typeof body.path === "string" && body.path.trim() ? body.path : undefined;
  const base64 =
    typeof body.base64 === "string" && body.base64 ? body.base64 : undefined;
  if (
    Boolean(path) === Boolean(base64) ||
    (path && (path.length > MAX_PDF_PATH_LENGTH || /[\0\r\n]/u.test(path))) ||
    (base64 &&
      (base64.length > MAX_PDF_BASE64_LENGTH ||
        base64.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]*={0,2}$/u.test(base64)))
  ) {
    throw new TypeError(
      "Provide exactly one valid path or base64 PDF payload.",
    );
  }
  const startPage = optionalPdfPage(body.startPage, "startPage");
  const endPage = optionalPdfPage(body.endPage, "endPage");
  if (startPage && endPage && startPage > endPage) {
    throw new TypeError("startPage cannot exceed endPage.");
  }

  return {
    path,
    base64,
    options: {
      startPage,
      endPage,
      preserveWhitespace: optionalPdfBoolean(
        body.preserveWhitespace,
        "preserveWhitespace",
      ),
      cleanContent: optionalPdfBoolean(body.cleanContent, "cleanContent"),
    },
  };
}

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
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "A valid JSON body is required." }, 400);
    }
    if (
      !isPlainObject(body) ||
      Object.keys(body).some((key) => !PDF_BODY_KEYS.has(key))
    ) {
      return json({ error: "Invalid PDF extraction request." }, 400);
    }

    let parsed: ReturnType<typeof parsePdfExtractionRequest>;
    try {
      parsed = parsePdfExtractionRequest(body);
    } catch (error) {
      if (error instanceof TypeError) {
        return json({ error: error.message }, 400);
      }
      throw error;
    }

    const text = parsed.path
      ? await context.services.documents.extractPdfFromPath(
          parsed.path,
          parsed.options,
        )
      : await context.services.documents.extractPdfFromBase64(
          parsed.base64 as string,
          parsed.options,
        );

    return json({ text });
  }

  return null;
}
