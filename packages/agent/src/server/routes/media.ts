import type { AppContext } from "@/runtime/bootstrap";
import { getNativeMediaControlPlane } from "@/runtime/native/service-bridge/control-planes";
import { json } from "@/server/responses";

export async function handleMediaRoutes(
  context: AppContext,
  request: Request,
  url: URL,
): Promise<Response | null> {
  if (request.method === "GET" && url.pathname === "/media/inspect") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      media: context.services.media.inspect(path),
    });
  }

  if (request.method === "GET" && url.pathname === "/media/transcript") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    const media = context.services.media.inspect(path);
    return json({
      path,
      transcriptPath: media.transcriptPath,
      transcriptPreview: media.transcriptPreview,
    });
  }

  if (request.method === "GET" && url.pathname === "/media/caption") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    const media = context.services.media.inspect(path);
    return json({
      path,
      captionPath: media.captionPath,
      captionPreview: media.captionPreview,
    });
  }

  if (request.method === "GET" && url.pathname === "/media/bundle") {
    const path = url.searchParams.get("path");
    if (!path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      bundle: context.services.media.bundle(path),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/analyze") {
    const body = (await request.json()) as {
      path?: string;
      focus?: "auto" | "voice" | "vision" | "research";
    };
    if (!body.path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      analysis: await context.services.media.analyzeWithModel(
        body.path,
        body.focus ?? "auto",
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/transcribe") {
    const body = (await request.json()) as {
      path?: string;
      language?: string;
      prompt?: string;
      name?: string;
    };
    if (!body.path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      transcription: await context.services.media.transcribeWithModel(
        body.path,
        {
          language: body.language,
          prompt: body.prompt,
          name: body.name,
        },
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/speak") {
    const body = (await request.json()) as {
      text?: string;
      name?: string;
      voice?: string;
      format?: "mp3" | "svg";
      speed?: number;
    };
    if (!body.text) {
      return json({ error: "text is required" }, 400);
    }
    return json({
      speech: await context.services.media.speakWithModel(body.text, {
        name: body.name,
        voice: body.voice,
        format: body.format,
        speed: body.speed,
      }),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/generate") {
    const body = (await request.json()) as {
      prompt?: string;
      name?: string;
      size?: string;
      style?: string;
      focus?: string;
    };
    if (!body.prompt) {
      return json({ error: "prompt is required" }, 400);
    }
    return json({
      generation: await context.services.media.generateImage(body.prompt, {
        name: body.name,
        size: body.size,
        style: body.style,
        focus: body.focus,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/media") {
    return json({
      media: getNativeMediaControlPlane(context.config),
    });
  }

  return null;
}
