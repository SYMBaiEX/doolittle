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
} from "@/runtime/native/service-bridge/index";
import type { AgentExecutionContext } from "../chat";

type AnalysisLabel = "browser" | "browser-comparison";

export async function handleBrowserMediaCommand(
  trimmed: string,
  context: AgentExecutionContext,
  options: {
    runAnalysis: (prompt: string, label: AnalysisLabel) => Promise<string>;
  },
): Promise<string | undefined> {
  if (trimmed.startsWith("/web fetch ")) {
    const url = trimmed.replace("/web fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed === "/browser" || trimmed === "/browser status") {
    return JSON.stringify(
      await getEffectiveBrowserStatus(context.runtime, context.services),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser fetch ")) {
    const url = trimmed.replace("/browser fetch ", "").trim();
    return JSON.stringify(
      await fetchEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser inspect ")) {
    const url = trimmed.replace("/browser inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser snapshot ")) {
    const url = trimmed.replace("/browser snapshot ", "").trim();
    return await snapshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/browser screenshot ")) {
    const url = trimmed.replace("/browser screenshot ", "").trim();
    return await screenshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/browser capture ")) {
    const url = trimmed.replace("/browser capture ", "").trim();
    return JSON.stringify(
      await captureEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/browser analyze ")) {
    const url = trimmed.replace("/browser analyze ", "").trim();
    if (!url) {
      return "Usage: /browser analyze <url>";
    }
    const analysis = await analyzeEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
    const response = await options.runAnalysis(analysis.prompt, "browser");
    return JSON.stringify({ analysis, response }, null, 2);
  }

  if (trimmed.startsWith("/browser compare analyze ")) {
    const payload = trimmed.replace("/browser compare analyze ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare analyze <left-url> :: <right-url>";
    }
    const analysis = await analyzeEffectiveBrowserComparison(
      context.runtime,
      context.services,
      leftUrl,
      rightUrl,
    );
    const response = await options.runAnalysis(
      analysis.prompt,
      "browser-comparison",
    );
    return JSON.stringify({ analysis, response }, null, 2);
  }

  if (trimmed.startsWith("/browser compare ")) {
    const payload = trimmed.replace("/browser compare ", "");
    const [leftUrl, rightUrl] = payload.split("::").map((part) => part.trim());
    if (!leftUrl || !rightUrl) {
      return "Usage: /browser compare <left-url> :: <right-url>";
    }
    return JSON.stringify(
      await compareEffectiveBrowserPages(
        context.runtime,
        context.services,
        leftUrl,
        rightUrl,
      ),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/web snapshot ")) {
    const url = trimmed.replace("/web snapshot ", "").trim();
    return await snapshotEffectiveBrowserPage(
      context.runtime,
      context.services,
      url,
    );
  }

  if (trimmed.startsWith("/web inspect ")) {
    const url = trimmed.replace("/web inspect ", "").trim();
    return JSON.stringify(
      await inspectEffectiveBrowserPage(context.runtime, context.services, url),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media inspect ")) {
    const path = trimmed.replace("/media inspect ", "").trim();
    return JSON.stringify(context.services.media.inspect(path), null, 2);
  }

  if (trimmed.startsWith("/media transcript ")) {
    const path = trimmed.replace("/media transcript ", "").trim();
    const inspection = context.services.media.inspect(path);
    return inspection.transcriptPreview ?? "No transcript sidecar detected.";
  }

  if (trimmed.startsWith("/media caption ")) {
    const path = trimmed.replace("/media caption ", "").trim();
    const inspection = context.services.media.inspect(path);
    return inspection.captionPreview ?? "No caption sidecar detected.";
  }

  if (trimmed.startsWith("/media bundle ")) {
    const path = trimmed.replace("/media bundle ", "").trim();
    return JSON.stringify(context.services.media.bundle(path), null, 2);
  }

  if (trimmed.startsWith("/media analyze ")) {
    const path = trimmed.replace("/media analyze ", "").trim();
    if (!path) {
      return "Usage: /media analyze <path>";
    }
    return JSON.stringify(
      await context.services.media.analyzeWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media transcribe ")) {
    const path = trimmed.replace("/media transcribe ", "").trim();
    if (!path) {
      return "Usage: /media transcribe <path>";
    }
    return JSON.stringify(
      await context.services.media.transcribeWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media speak ")) {
    const text = trimmed.replace("/media speak ", "").trim();
    if (!text) {
      return "Usage: /media speak <text>";
    }
    return JSON.stringify(
      await context.services.media.speakWithModel(text),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media voice ")) {
    const path = trimmed.replace("/media voice ", "").trim();
    if (!path) {
      return "Usage: /media voice <path>";
    }
    return JSON.stringify(
      await context.services.media.voiceWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media vision ")) {
    const path = trimmed.replace("/media vision ", "").trim();
    if (!path) {
      return "Usage: /media vision <path>";
    }
    return JSON.stringify(
      await context.services.media.visionWithModel(path),
      null,
      2,
    );
  }

  if (trimmed.startsWith("/media generate ")) {
    const prompt = trimmed.replace("/media generate ", "").trim();
    if (!prompt) {
      return "Usage: /media generate <prompt>";
    }
    return JSON.stringify(
      await context.services.media.generateImage(prompt),
      null,
      2,
    );
  }

  return undefined;
}
