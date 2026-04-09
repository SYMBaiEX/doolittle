import { hashContent } from "./artifacts";
import type { WebPageSnapshot } from "./service-types";

export function extractReadableText(
  content: string,
  contentType = "text/html",
): {
  title?: string;
  metaDescription?: string;
  canonicalUrl?: string;
  text: string;
} {
  if (
    !/html|xhtml|xml|svg/i.test(contentType) &&
    !/<[a-z][\s\S]*>/iu.test(content)
  ) {
    const text = content
      .replace(/\r\n/gu, "\n")
      .split(/\n/u)
      .map((line) => line.replace(/\s+/gu, " ").trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    return {
      text: text.slice(0, 20_000),
    };
  }

  const titleMatch = content.match(/<title[^>]*>(.*?)<\/title>/isu);
  const descriptionMatch = content.match(
    /<meta[^>]+name=["']description["'][^>]+content=["'](.*?)["'][^>]*>/isu,
  );
  const canonicalMatch = content.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["'](.*?)["'][^>]*>/isu,
  );
  const text = content
    .replace(/<\/(p|div|section|article|li|h[1-6]|br)>/giu, "\n")
    .replace(/<script[\s\S]*?<\/script>/giu, " ")
    .replace(/<style[\s\S]*?<\/style>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .split(/\n/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    title: titleMatch?.[1]?.trim(),
    metaDescription: descriptionMatch?.[1]?.trim(),
    canonicalUrl: canonicalMatch?.[1]?.trim(),
    text: text.slice(0, 20_000),
  };
}

export function buildPageMetrics(
  html: string,
  text: string,
  contentType: string,
): Omit<
  WebPageSnapshot,
  | "url"
  | "title"
  | "metaDescription"
  | "canonicalUrl"
  | "text"
  | "provider"
  | "mode"
  | "renderedAt"
> {
  const wordCount = text ? text.split(/\s+/u).filter(Boolean).length : 0;
  const lineCount = text
    ? text.split(/\n/u).filter((line) => line.trim().length > 0).length
    : 0;
  const linkCount = (html.match(/<a\b/giu) ?? []).length;
  const imageCount = (html.match(/<img\b/giu) ?? []).length;
  const headingCount = (html.match(/<h[1-6]\b/giu) ?? []).length;
  const contentLength = Buffer.byteLength(html, "utf8");

  return {
    contentType,
    contentLength,
    wordCount,
    lineCount,
    linkCount,
    imageCount,
    headingCount,
    contentHash: hashContent(html),
  };
}
