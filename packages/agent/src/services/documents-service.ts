import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IAgentRuntime } from "@elizaos/core";
import {
  type NativePdfService,
  PDF_SERVICE,
} from "@/runtime/native/service-bridge/runtime-contracts";
import {
  resolveWorkspaceDirectory,
  type WorkspaceDirectorySource,
} from "./workspace-directory";

export interface PdfExtractOptions {
  startPage?: number;
  endPage?: number;
  preserveWhitespace?: boolean;
  cleanContent?: boolean;
}

export class DocumentsService {
  constructor(
    private readonly runtime: Partial<Pick<IAgentRuntime, "getService">>,
    private readonly workspaceDirectory: WorkspaceDirectorySource,
  ) {}

  async extractPdfFromPath(
    path: string,
    options: PdfExtractOptions = {},
  ): Promise<string> {
    const resolvedPath = resolve(
      resolveWorkspaceDirectory(this.workspaceDirectory),
      path,
    );
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

  async extractPdf(
    path: string,
    options: PdfExtractOptions = {},
  ): Promise<string> {
    return this.extractPdfFromPath(path, options);
  }

  private async extractPdfFromBuffer(
    pdfBuffer: Buffer,
    options: PdfExtractOptions,
  ): Promise<string> {
    const pdfService = this.runtime.getService?.(
      PDF_SERVICE,
    ) as NativePdfService | null;
    if (!pdfService) {
      throw new Error(
        "The Eliza PDF service is not ready. Ensure @elizaos/plugin-pdf is registered.",
      );
    }
    const result = await pdfService.convertPdfToTextWithOptions(
      pdfBuffer,
      options,
    );
    if (!result.success) {
      throw new Error(result.error ?? "PDF extraction failed.");
    }
    return result.text ?? "";
  }
}
