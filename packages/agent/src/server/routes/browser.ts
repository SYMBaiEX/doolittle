import type { AppContext } from "@/runtime/bootstrap";
import { runModelAnalysis } from "@/runtime/model-analysis";
import {
  analyzeBrowserComparison,
  analyzeBrowserPage,
  captureBrowserPage,
  compareBrowserPages,
  fetchBrowserPage,
  getBrowserStatus,
  inspectBrowserPage,
  screenshotBrowserPage,
  snapshotBrowserPage,
} from "@/runtime/native/service-bridge/browser";
import { getEffectiveActivePersonality } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";

type BrowserAnalysisTurn = typeof runModelAnalysis;

const MAX_BROWSER_URL_LENGTH = 4_096;

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function hasEncodedControlCharacters(value: string): boolean {
  let decoded = value;
  for (let index = 0; index < 6; index += 1) {
    if (hasControlCharacters(decoded)) return true;
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return false;
      decoded = next;
    } catch {
      return false;
    }
  }
  return hasControlCharacters(decoded);
}

function validateBrowserUrl(value: unknown, field: string): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${field} is required`;
  }
  if (value.length > MAX_BROWSER_URL_LENGTH) {
    return `${field} must be at most ${MAX_BROWSER_URL_LENGTH} characters`;
  }
  if (hasEncodedControlCharacters(value)) {
    return `${field} must not contain control characters`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return `${field} must use http or https`;
    }
    if (parsed.username || parsed.password) {
      return `${field} must not include credentials`;
    }
    if (!parsed.hostname) {
      return `${field} must be a valid URL`;
    }
  } catch {
    return `${field} must be a valid URL`;
  }

  return null;
}

export async function handleBrowserRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  runAnalysisTurn: BrowserAnalysisTurn = runModelAnalysis,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/web/fetch") {
    const targetUrl = url.searchParams.get("url");
    const error = validateBrowserUrl(targetUrl, "url");
    if (error) return json({ error }, 400);
    return json({
      page: await fetchBrowserPage(context.runtime, targetUrl as string),
    });
  }

  if (request.method === "GET" && url.pathname === "/browser/status") {
    return json({
      browser: await getBrowserStatus(context.runtime),
    });
  }

  if (
    request.method === "GET" &&
    (url.pathname === "/browser/inspect" || url.pathname === "/web/inspect")
  ) {
    const targetUrl = url.searchParams.get("url");
    const error = validateBrowserUrl(targetUrl, "url");
    if (error) return json({ error }, 400);
    return json({
      inspection: await inspectBrowserPage(
        context.runtime,
        targetUrl as string,
      ),
    });
  }

  if (
    request.method === "POST" &&
    (url.pathname === "/web/snapshot" || url.pathname === "/browser/snapshot")
  ) {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      path: await snapshotBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/screenshot") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      path: await screenshotBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/capture") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      capture: await captureBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/analyze") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    const analysis = await analyzeBrowserPage(
      context.runtime,
      body.url as string,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(context, analysis.prompt, {
        label: "browser",
        personalityId: getEffectiveActivePersonality(context.runtime).id,
        abortSignal: request.signal,
      }),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/compare") {
    const body = (await request.json()) as {
      leftUrl?: unknown;
      rightUrl?: unknown;
    };
    if (!body.leftUrl || !body.rightUrl) {
      return json({ error: "leftUrl and rightUrl are required" }, 400);
    }
    const leftError = validateBrowserUrl(body.leftUrl, "leftUrl");
    if (leftError) return json({ error: leftError }, 400);
    const rightError = validateBrowserUrl(body.rightUrl, "rightUrl");
    if (rightError) return json({ error: rightError }, 400);
    return json({
      comparison: await compareBrowserPages(
        context.runtime,
        body.leftUrl as string,
        body.rightUrl as string,
      ),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/browser/compare/analyze"
  ) {
    const body = (await request.json()) as {
      leftUrl?: unknown;
      rightUrl?: unknown;
    };
    if (!body.leftUrl || !body.rightUrl) {
      return json({ error: "leftUrl and rightUrl are required" }, 400);
    }
    const leftError = validateBrowserUrl(body.leftUrl, "leftUrl");
    if (leftError) return json({ error: leftError }, 400);
    const rightError = validateBrowserUrl(body.rightUrl, "rightUrl");
    if (rightError) return json({ error: rightError }, 400);
    const analysis = await analyzeBrowserComparison(
      context.runtime,
      body.leftUrl as string,
      body.rightUrl as string,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(context, analysis.prompt, {
        label: "browser-comparison",
        personalityId: getEffectiveActivePersonality(context.runtime).id,
        abortSignal: request.signal,
      }),
    });
  }

  return null;
}
