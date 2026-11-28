import { type ComponentProps, useState } from "react";
import {
  Streamdown,
  type StreamdownProps,
  type UrlTransform,
} from "streamdown";
import { MessageMarkdownCode } from "./MessageCodeBlock";
import { safeHttpMessageUrl } from "./message-output";
import "./message-content.css";

/**
 * One markdown pipeline for every user-facing prose surface: assistant
 * messages and prose tool results share the exact same component mapping,
 * control set, link safety and URL sanitization, so a surface can never drift
 * into a less-safe or less-capable rendering of the same authored markdown.
 */
export const safeMessageUrl: UrlTransform = (url, key) =>
  key === "src"
    ? safeHttpMessageUrl(url)
    : /^(?:#|https?:|mailto:)/iu.test(url.trim())
      ? url
      : null;

function MessageImage({
  alt,
  src,
  title,
  width,
  height,
}: ComponentProps<"img"> & { node?: unknown }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const safeSrc = typeof src === "string" ? safeHttpMessageUrl(src) : null;
  if (!safeSrc || failedSrc === safeSrc) {
    return (
      <span data-message-image-unavailable="true">
        {alt?.trim() || "Image unavailable"}
      </span>
    );
  }
  return (
    <img
      alt={alt ?? ""}
      height={height}
      loading="lazy"
      onError={() => setFailedSrc(safeSrc)}
      referrerPolicy="no-referrer"
      src={safeSrc}
      title={title}
      width={width}
    />
  );
}

const MARKDOWN_COMPONENTS: StreamdownProps["components"] = {
  code: MessageMarkdownCode,
  img: MessageImage,
};
const MARKDOWN_CONTROLS: StreamdownProps["controls"] = {
  code: false,
  table: { copy: true, download: false, fullscreen: false },
};
const MARKDOWN_LINK_SAFETY = { enabled: true };

export function MessageMarkdown({
  text,
  className = "chat-message-prose",
  pending = false,
}: {
  text: string;
  className?: string;
  pending?: boolean;
}) {
  return (
    <Streamdown
      animated={false}
      caret="circle"
      className={className}
      components={MARKDOWN_COMPONENTS}
      controls={MARKDOWN_CONTROLS}
      dir="auto"
      isAnimating={pending}
      linkSafety={MARKDOWN_LINK_SAFETY}
      mode={pending ? "streaming" : "static"}
      normalizeHtmlIndentation
      urlTransform={safeMessageUrl}
    >
      {text}
    </Streamdown>
  );
}
