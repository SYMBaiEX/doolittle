import { writeFileSync } from "node:fs";

import { fal } from "@fal-ai/client";

import type { MediaModelContext } from "../types";
import { renderSpeechSvg } from "./renderers";

export async function requestSpeechGeneration(input: {
  outputDir: string;
  script: string;
  voice: string;
  speed?: number;
  preferredFormat: "mp3" | "svg";
  fallbackArtifactPath: string;
  context: MediaModelContext | undefined;
}): Promise<{
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  response: string;
}> {
  let artifactPath = input.fallbackArtifactPath;
  let artifactKind: "mp3" | "svg" = "svg";
  let response = "Generated an offline Doolittle speech concept artifact.";

  if (input.preferredFormat !== "svg" && input.context?.falApiKey) {
    try {
      const tts = await generateFalSpeech(input.script, {
        apiKey: input.context.falApiKey,
        voice: resolveFalVoice(input.voice),
      });
      const audioResponse = await fetch(tts.audioUrl);
      if (!audioResponse.ok) {
        const body = await audioResponse.text();
        throw new Error(
          `Official TTS artifact download failed (${audioResponse.status}): ${body}`,
        );
      }

      const bytes = Buffer.from(await audioResponse.arrayBuffer());
      artifactPath = artifactPath.replace(/\.svg$/u, ".mp3");
      artifactKind = "mp3";
      writeFileSync(artifactPath, bytes);
      response = `Generated official TTS plugin-compatible speech audio at ${artifactPath}.`;
    } catch (error) {
      response = error instanceof Error ? error.message : String(error);
    }
  }

  if (
    artifactKind !== "mp3" &&
    input.preferredFormat !== "svg" &&
    input.context?.provider === "openai" &&
    input.context.openAiApiKey
  ) {
    try {
      const synthResponse = await fetch(
        `${input.context.baseUrl}/audio/speech`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.context.openAiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: input.context.model,
            input: input.script,
            voice: input.voice,
            response_format: "mp3",
            speed: input.speed,
          }),
        },
      );

      if (!synthResponse.ok) {
        const body = await synthResponse.text();
        throw new Error(
          `OpenAI speech synthesis failed (${synthResponse.status}): ${body}`,
        );
      }

      const bytes = Buffer.from(await synthResponse.arrayBuffer());
      artifactPath = artifactPath.replace(/\.svg$/u, ".mp3");
      artifactKind = "mp3";
      writeFileSync(artifactPath, bytes);
      response = `Generated provider-native speech audio at ${artifactPath}.`;
    } catch (error) {
      response = error instanceof Error ? error.message : String(error);
      artifactPath = input.fallbackArtifactPath;
      artifactKind = "svg";
      writeFileSync(
        artifactPath,
        renderSpeechSvg(input.script, input.voice, input.speed),
        "utf8",
      );
    }
  }

  if (artifactKind !== "mp3") {
    writeFileSync(
      artifactPath,
      renderSpeechSvg(input.script, input.voice, input.speed),
      "utf8",
    );
  }

  return {
    artifactPath,
    artifactKind,
    response,
  };
}

function resolveFalVoice(voice?: string): string {
  if (!voice || voice === "alloy") {
    return "Jennifer (English (US)/American)";
  }
  return voice;
}

async function generateFalSpeech(
  text: string,
  options: {
    apiKey: string;
    voice: string;
  },
): Promise<{ audioUrl: string }> {
  fal.config({
    credentials: options.apiKey,
  });
  const response = (await fal.subscribe("fal-ai/playai/tts/v3", {
    input: {
      input: text,
      voice: options.voice,
    },
    logs: false,
  })) as {
    data?: {
      audio?: {
        url?: string;
      };
    };
  };
  const audioUrl = response.data?.audio?.url;
  if (!audioUrl) {
    throw new Error(
      "Official TTS plugin did not return an audio artifact URL.",
    );
  }
  return {
    audioUrl,
  };
}
