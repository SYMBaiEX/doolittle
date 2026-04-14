export type TextMetadata = {
  preview: string;
  lineCount: number;
  wordCount: number;
  pageCount?: number;
  title?: string;
  author?: string;
};

export type PdfMetadata = {
  preview: string;
  lineCount?: number;
  wordCount?: number;
  pageCount?: number;
  title?: string;
  author?: string;
};

export type AudioMetadata = {
  durationMs?: number;
};
