import { describe, expect, it } from "bun:test";
import type { AppContext } from "@/runtime/bootstrap";
import { handleMediaRoutes } from "./media";

function createContext(): AppContext {
  return {
    config: { dataDir: "/tmp/doolittle", workspaceDir: "/tmp/doolittle" },
    services: {
      media: {
        analyzeWithModel: async (path: string, focus?: string) => ({
          path,
          focus,
          analysis: true,
        }),
        bundle: (path: string) => ({ path, bundle: true }),
        generateImage: async (
          prompt: string,
          options?: Record<string, unknown>,
        ) => ({
          prompt,
          options,
          generated: true,
        }),
        inspect: (path: string) => ({
          path,
          transcriptPath: `${path}.txt`,
          transcriptPreview: `transcript:${path}`,
          captionPath: `${path}.vtt`,
          captionPreview: `caption:${path}`,
        }),
        speakWithModel: async (
          text: string,
          options?: Record<string, unknown>,
        ) => ({
          text,
          options,
          speech: true,
        }),
        transcribeWithModel: async (
          path: string,
          options?: Record<string, unknown>,
        ) => ({
          path,
          options,
          transcription: true,
        }),
      },
    },
  } as unknown as AppContext;
}

describe("handleMediaRoutes", () => {
  it("validates required media query parameters", async () => {
    const response = await handleMediaRoutes(
      createContext(),
      new Request("http://localhost/media/inspect"),
      new URL("http://localhost/media/inspect"),
    );

    expect(response?.status).toBe(400);
    expect(await response?.json()).toEqual({ error: "path is required" });
  });

  it("serves inspect, transcript, caption, and bundle payloads", async () => {
    const context = createContext();
    const inspect = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/inspect?path=clip.wav"),
      new URL("http://localhost/media/inspect?path=clip.wav"),
    );
    const transcript = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/transcript?path=clip.wav"),
      new URL("http://localhost/media/transcript?path=clip.wav"),
    );
    const caption = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/caption?path=clip.wav"),
      new URL("http://localhost/media/caption?path=clip.wav"),
    );
    const bundle = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/bundle?path=clip.wav"),
      new URL("http://localhost/media/bundle?path=clip.wav"),
    );

    expect((await inspect?.json())?.media.path).toBe("clip.wav");
    expect((await transcript?.json())?.transcriptPreview).toBe(
      "transcript:clip.wav",
    );
    expect((await caption?.json())?.captionPreview).toBe("caption:clip.wav");
    expect((await bundle?.json())?.bundle).toEqual({
      path: "clip.wav",
      bundle: true,
    });
  });

  it("dispatches analyze, transcribe, speak, generate, and runtime control-plane routes", async () => {
    const context = createContext();
    const analyze = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/analyze", {
        method: "POST",
        body: JSON.stringify({ path: "clip.wav", focus: "voice" }),
      }),
      new URL("http://localhost/media/analyze"),
    );
    const transcribe = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/transcribe", {
        method: "POST",
        body: JSON.stringify({ path: "clip.wav", language: "en" }),
      }),
      new URL("http://localhost/media/transcribe"),
    );
    const speak = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/speak", {
        method: "POST",
        body: JSON.stringify({ text: "hello", voice: "alloy" }),
      }),
      new URL("http://localhost/media/speak"),
    );
    const generate = await handleMediaRoutes(
      context,
      new Request("http://localhost/media/generate", {
        method: "POST",
        body: JSON.stringify({ prompt: "diagram" }),
      }),
      new URL("http://localhost/media/generate"),
    );
    const runtime = await handleMediaRoutes(
      context,
      new Request("http://localhost/runtime/media"),
      new URL("http://localhost/runtime/media"),
    );

    expect((await analyze?.json())?.analysis.focus).toBe("voice");
    expect((await transcribe?.json())?.transcription.path).toBe("clip.wav");
    expect((await speak?.json())?.speech.text).toBe("hello");
    expect((await generate?.json())?.generation.prompt).toBe("diagram");
    expect(await runtime?.json()).toHaveProperty("media");
  });

  it("returns null for unrelated routes", async () => {
    const response = await handleMediaRoutes(
      createContext(),
      new Request("http://localhost/not-media"),
      new URL("http://localhost/not-media"),
    );

    expect(response).toBeNull();
  });
});
