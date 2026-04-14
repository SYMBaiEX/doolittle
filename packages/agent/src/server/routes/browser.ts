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
import { json } from "@/server/responses";

type BrowserAnalysisTurn = typeof runModelAnalysisTurn;

export async function handleBrowserRoutes(
  context: AppContext,
  request: Request,
  url: URL,
  runAnalysisTurn: BrowserAnalysisTurn = runModelAnalysisTurn,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/web/fetch") {
    const targetUrl = url.searchParams.get("url");
    if (!targetUrl) {
      return json({ error: "url is required" }, 400);
    }
    return json({
      page: await fetchEffectiveBrowserPage(
        context.runtime,
        context.services,
        targetUrl,
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
    if (!targetUrl) {
      return json({ error: "url is required" }, 400);
    }
    return json({
      inspection: await inspectEffectiveBrowserPage(
        context.runtime,
        context.services,
        targetUrl,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/web/snapshot") {
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return json({ error: "url is required" }, 400);
    }
    return json({
      path: await snapshotEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/screenshot") {
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return json({ error: "url is required" }, 400);
    }
    return json({
      path: await screenshotEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/capture") {
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return json({ error: "url is required" }, 400);
    }
    return json({
      capture: await captureEffectiveBrowserPage(
        context.runtime,
        context.services,
        body.url,
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/analyze") {
    const body = (await request.json()) as { url?: string };
    if (!body.url) {
      return json({ error: "url is required" }, 400);
    }
    const analysis = await analyzeEffectiveBrowserPage(
      context.runtime,
      context.services,
      body.url,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(context, analysis.prompt, "browser", {
        personalityId: context.services.personalities.getActive().id,
      }),
    });
  }

  if (request.method === "POST" && url.pathname === "/browser/compare") {
    const body = (await request.json()) as {
      leftUrl?: string;
      rightUrl?: string;
    };
    if (!body.leftUrl || !body.rightUrl) {
      return json({ error: "leftUrl and rightUrl are required" }, 400);
    }
    return json({
      comparison: await compareEffectiveBrowserPages(
        context.runtime,
        context.services,
        body.leftUrl,
        body.rightUrl,
      ),
    });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/browser/compare/analyze"
  ) {
    const body = (await request.json()) as {
      leftUrl?: string;
      rightUrl?: string;
    };
    if (!body.leftUrl || !body.rightUrl) {
      return json({ error: "leftUrl and rightUrl are required" }, 400);
    }
    const analysis = await analyzeEffectiveBrowserComparison(
      context.runtime,
      context.services,
      body.leftUrl,
      body.rightUrl,
    );
    return json({
      analysis,
      response: await runAnalysisTurn(
        context,
        analysis.prompt,
        "browser-comparison",
        {
          personalityId: context.services.personalities.getActive().id,
        },
      ),
    });
  }

  return null;
}
