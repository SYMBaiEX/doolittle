import type { AppContext } from "@/runtime/bootstrap";
import { runModelAnalysisTurn } from "@/runtime/chat";
import {
  analyzeEffectiveBrowserComparison,
  analyzeEffectiveBrowserPage,
  captureEffectiveBrowserPage,
  compareEffectiveBrowserPages,
  fetchEffectiveBrowserPage,
  getEffectiveBrowserStatus,
  inspectEffectiveBrowserPage,
  screenshotEffectiveBrowserPage,
  snapshotEffectiveBrowserPage,
} from "@/runtime/native/service-bridge/browser";
import { getEffectiveActivePersonality } from "@/runtime/native/service-bridge/ownership";
import { json } from "@/server/responses";

type BrowserAnalysisTurn = typeof runModelAnalysisTurn;

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
  runAnalysisTurn: BrowserAnalysisTurn = runModelAnalysisTurn,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/web/fetch") {
    const targetUrl = url.searchParams.get("url");
    const error = validateBrowserUrl(targetUrl, "url");
    if (error) return json({ error }, 400);
    return json({
      page: await fetchEffectiveBrowserPage(
        context.runtime,
        context.services,
        targetUrl as string,
      ),
    });
  }

  if (request.method === "GET" && url.pathname === "/browser/status") {
    return json({
      browser: await getEffectiveBrowserStatus(
        context.runtime,
        context.services,
      ),
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
      inspection: await inspectEffectiveBrowserPage(
        context.runtime,
        context.services,
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
      path: await snapshotEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url as string,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/screenshot") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      path: await screenshotEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url as string,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/capture") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      capture: await captureEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url as string,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/analyze") {
    const body = (await request.json()) as { url?: unknown };
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    const analysis = await analyzeEffectiveBrowserPage(
      context.runtime,
      context.services,
      body.url as string,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(context, analysis.prompt, "browser", {
        personalityId: getEffectiveActivePersonality(context.runtime).id,
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
      comparison: await compareEffectiveBrowserPages(
        context.runtime,
        context.services,
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
    const analysis = await analyzeEffectiveBrowserComparison(
      context.runtime,
      context.services,
      body.leftUrl as string,
      body.rightUrl as string,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(
        context,
        analysis.prompt,
        "browser-comparison",
        {
          personalityId: getEffectiveActivePersonality(context.runtime).id,
        },
      ),
    });
  }

  return null;
}
