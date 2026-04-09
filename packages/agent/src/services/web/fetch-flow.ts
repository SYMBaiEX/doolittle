import { buildPageMetrics, extractReadableText } from "./content";
import {
  browserCommandExists,
  fetchWithBasic,
  fetchWithLightpanda,
} from "./fetch";
import type {
  BrowserConfig,
  WebPageSnapshot,
  WebServiceState,
} from "./service-types";

function nowIso(): string {
  return new Date().toISOString();
}

function buildPageSnapshot(
  url: string,
  body: string,
  contentType: string,
  provider: "lightpanda" | "basic",
  mode: "browser" | "fallback",
): WebPageSnapshot {
  const readable = extractReadableText(body, contentType);
  const metrics = buildPageMetrics(body, readable.text, contentType);
  return {
    url,
    ...readable,
    ...metrics,
    provider,
    mode,
    renderedAt: nowIso(),
  };
}

export async function fetchBrowserPage(
  url: string,
  config: BrowserConfig,
  state: WebServiceState,
): Promise<WebPageSnapshot> {
  if (
    config.provider === "lightpanda" &&
    (await browserCommandExists(config.command))
  ) {
    try {
      const fetched = await fetchWithLightpanda(url, config);
      state.touchFetched();
      state.setError(undefined);
      return buildPageSnapshot(
        url,
        fetched.body,
        fetched.contentType,
        "lightpanda",
        "browser",
      );
    } catch (error) {
      state.setError(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const fetched = await fetchWithBasic(url);
    state.touchFetched();
    state.setError(undefined);
    return buildPageSnapshot(
      url,
      fetched.body,
      fetched.contentType,
      config.provider,
      "fallback",
    );
  } catch (error) {
    state.setError(error instanceof Error ? error.message : String(error));
    throw error;
  }
}
