import { describe, expect, it } from "bun:test";
import type { AgentExecutionContext } from "../chat";
import { handleBrowserMediaCommand } from "./browser-media-commands";

function createContext(): AgentExecutionContext {
  return {
    runtime: {},
    services: {
      media: {
        analyzeWithModel: async (path: string) => ({ path, analysis: true }),
        bundle: (path: string) => ({ path, bundle: true }),
        generateImage: async (prompt: string) => ({ prompt, image: true }),
        inspect: (path: string) => ({
          path,
          transcriptPreview: `transcript:${path}`,
          captionPreview: `caption:${path}`,
        }),
        speakWithModel: async (text: string) => ({ text, speech: true }),
        transcribeWithModel: async (path: string) => ({
          path,
          transcription: true,
        }),
        visionWithModel: async (path: string) => ({ path, vision: true }),
        voiceWithModel: async (path: string) => ({ path, voice: true }),
      },
      web: {
        analyze: async (url: string) => ({ prompt: `analyze:${url}`, url }),
        analyzeComparison: async (left: string, right: string) => ({
          prompt: `compare:${left}:${right}`,
          left,
          right,
        }),
        capture: async (url: string) => ({ url, capture: true }),
        compare: async (left: string, right: string) => ({
          left,
          right,
          compare: true,
        }),
        fetchText: async (url: string) => ({ url, body: "ok" }),
        inspect: async (url: string) => ({ url, inspect: true }),
        screenshot: async (url: string) => `screenshot:${url}`,
        snapshot: async (url: string) => `snapshot:${url}`,
      },
    },
  } as unknown as AgentExecutionContext;
}

describe("browser and media command router", () => {
  it("runs browser analysis through the injected analysis callback", async () => {
    const result = await handleBrowserMediaCommand(
      "/browser analyze https://example.com",
      createContext(),
      {
        runAnalysis: async (prompt, label) => `${label}:${prompt}`,
      },
    );

    expect(result).toContain('"prompt": "analyze:https://example.com"');
    expect(result).toContain(
      '"response": "browser:analyze:https://example.com"',
    );
  });

  it("dispatches media commands and compare-analysis flows", async () => {
    const context = createContext();
    const speak = await handleBrowserMediaCommand(
      "/media speak hello world",
      context,
      {
        runAnalysis: async () => "unused",
      },
    );
    const usage = await handleBrowserMediaCommand(
      "/browser compare analyze left-only",
      context,
      {
        runAnalysis: async () => "unused",
      },
    );
    const analysis = await handleBrowserMediaCommand(
      "/browser compare analyze https://left.example :: https://right.example",
      context,
      {
        runAnalysis: async (prompt, label) => `${label}:${prompt}`,
      },
    );

    expect(speak).toContain('"speech": true');
    expect(usage).toBe(
      "Usage: /browser compare analyze <left-url> :: <right-url>",
    );
    expect(analysis).toContain(
      '"prompt": "compare:https://left.example:https://right.example"',
    );
    expect(analysis).toContain(
      '"response": "browser-comparison:compare:https://left.example:https://right.example"',
    );
  });

  it("falls back to transcript and caption previews from media inspection", async () => {
    const context = createContext();
    const transcript = await handleBrowserMediaCommand(
      "/media transcript sample.wav",
      context,
      { runAnalysis: async () => "unused" },
    );
    const caption = await handleBrowserMediaCommand(
      "/media caption sample.wav",
      context,
      { runAnalysis: async () => "unused" },
    );

    expect(transcript).toBe("transcript:sample.wav");
    expect(caption).toBe("caption:sample.wav");
  });
});
