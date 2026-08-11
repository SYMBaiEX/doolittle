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
import { type JsonObject, readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";
import { hasEncodedAsciiControlCharacters } from "@/utils/text-validation";

type BrowserAnalysisTurn = typeof runModelAnalysis;

const MAX_BROWSER_URL_LENGTH = 4_096;

async function readBrowserBody(
  request: Request,
): Promise<JsonObject | Response> {
  const parsed = await readJsonObjectBody(request);
  return parsed.ok
    ? parsed.value
    : json({ error: "A valid JSON object body is required" }, 400);
}

function validateBrowserUrl(value: unknown, field: string): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return `${field} is required`;
  }
  if (value.length > MAX_BROWSER_URL_LENGTH) {
    return `${field} must be at most ${MAX_BROWSER_URL_LENGTH} characters`;
  }
  if (hasEncodedAsciiControlCharacters(value)) {
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
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      path: await snapshotBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/screenshot") {
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      path: await screenshotBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/capture") {
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
    const error = validateBrowserUrl(body.url, "url");
    if (error) return json({ error }, 400);
    return json({
      capture: await captureBrowserPage(context.runtime, body.url as string),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/analyze") {
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
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
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
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
    const body = await readBrowserBody(request);
    if (body instanceof Response) return body;
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
