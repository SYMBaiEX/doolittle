import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface PdfExtractOptions {
  startPage?: number;
  endPage?: number;
  preserveWhitespace?: boolean;
  cleanContent?: boolean;
}

export class DocumentsService {
  constructor(
    private readonly runtime: unknown,
    private readonly workspaceDir: string,
  ) {}

  async extractPdfFromPath(path: string, options: PdfExtractOptions = {}): Promise<string> {
    const resolvedPath = resolve(this.workspaceDir, path);
    const buffer = readFileSync(resolvedPath);
    return this.extractPdfFromBuffer(buffer, options);
  }

  async extractPdfFromBase64(
    base64: string,
    options: PdfExtractOptions = {},
  ): Promise<string> {
    const buffer = Buffer.from(base64, "base64");
    return this.extractPdfFromBuffer(buffer, options);
  }

  private async extractPdfFromBuffer(
    pdfBuffer: Buffer,
    options: PdfExtractOptions,
  ): Promise<string> {
    const { PdfService } = await import("@elizaos/plugin-pdf");
    const pdfService = new PdfService(this.runtime as never);
    const result = await pdfService.convertPdfToTextWithOptions(pdfBuffer, options);
    if (!result.success) {
      throw new Error(result.error ?? "PDF extraction failed.");
    }
    return result.text ?? "";
  }
}
