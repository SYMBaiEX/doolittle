import type { AppContext } from "@/runtime/bootstrap";
import { getNativeMediaControlPlane } from "@/runtime/native/service-bridge/control-planes";
import { readJsonObjectBody } from "@/server/request-body";
import { json } from "@/server/responses";

async function readMediaBody(
  request: Request,
): Promise<Record<string, unknown> | Response> {
  const parsed = await readJsonObjectBody(request);
  if (!parsed.ok) {
    return json(
      {
        error:
          parsed.reason === "invalid_json"
            ? "Invalid JSON body"
            : "JSON body must be an object",
      },
      400,
    );
  }
  return parsed.value;
}

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
    const body = await readMediaBody(request);
    if (body instanceof Response) return body;
    const typedBody = body as {
      path?: string;
      focus?: "auto" | "voice" | "vision" | "research";
    };
    if (!typedBody.path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      analysis: await context.services.media.analyzeWithModel(
        typedBody.path,
        typedBody.focus ?? "auto",
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/transcribe") {
    const body = await readMediaBody(request);
    if (body instanceof Response) return body;
    const typedBody = body as {
      path?: string;
      language?: string;
      prompt?: string;
      name?: string;
    };
    if (!typedBody.path) {
      return json({ error: "path is required" }, 400);
    }
    return json({
      transcription: await context.services.media.transcribeWithModel(
        typedBody.path,
        {
          language: typedBody.language,
          prompt: typedBody.prompt,
          name: typedBody.name,
        },
      ),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/speak") {
    const body = await readMediaBody(request);
    if (body instanceof Response) return body;
    const typedBody = body as {
      text?: string;
      name?: string;
      voice?: string;
      format?: "mp3" | "svg";
      speed?: number;
    };
    if (!typedBody.text) {
      return json({ error: "text is required" }, 400);
    }
    return json({
      speech: await context.services.media.speakWithModel(typedBody.text, {
        name: typedBody.name,
        voice: typedBody.voice,
        format: typedBody.format,
        speed: typedBody.speed,
      }),
    });
  }

  if (request.method === "POST" && url.pathname === "/media/generate") {
    const body = await readMediaBody(request);
    if (body instanceof Response) return body;
    const typedBody = body as {
      prompt?: string;
      name?: string;
      size?: string;
      style?: string;
      focus?: string;
    };
    if (!typedBody.prompt) {
      return json({ error: "prompt is required" }, 400);
    }
    return json({
      generation: await context.services.media.generateImage(typedBody.prompt, {
        name: typedBody.name,
        size: typedBody.size,
        style: typedBody.style,
        focus: typedBody.focus,
      }),
    });
  }

  if (request.method === "GET" && url.pathname === "/runtime/media") {
    return json({
      media: getNativeMediaControlPlane(context.runtime),
    });
  }

  return null;
}
