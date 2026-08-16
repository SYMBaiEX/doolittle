import { writeFileSync } from "node:fs";
import { ModelType } from "@elizaos/core";
import { isMediaAbort, throwIfMediaAborted } from "../abort";
import { renderSpeechSvg } from "./renderers";

export async function requestSpeechGeneration(input: {
  script: string;
  voice: string;
  speed?: number;
  preferredFormat: "mp3" | "svg";
  fallbackArtifactPath: string;
  synthesizeSpeech?: (
    text: string,
    options: { voice: string; speed?: number; signal?: AbortSignal },
  ) => Promise<Uint8Array | undefined>;
  signal?: AbortSignal;
}): Promise<{
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  response: string;
  provider: string;
  model: string;
}> {
  throwIfMediaAborted(input.signal);
  let artifactPath = input.fallbackArtifactPath;
  let artifactKind: "mp3" | "svg" = "svg";
  let response = "Generated an offline Doolittle speech concept artifact.";

  if (input.preferredFormat !== "svg" && input.synthesizeSpeech) {
    try {
      const bytes = await input.synthesizeSpeech(input.script, {
        voice: input.voice,
        speed: input.speed,
        signal: input.signal,
      });
      throwIfMediaAborted(input.signal);
      if (bytes && bytes.byteLength > 0) {
        artifactPath = artifactPath.replace(/\.svg$/u, ".mp3");
        artifactKind = "mp3";
        writeFileSync(artifactPath, bytes);
        response = `Generated speech through Eliza ${ModelType.TEXT_TO_SPEECH} at ${artifactPath}.`;
      }
    } catch (error) {
      if (isMediaAbort(error, input.signal)) throw error;
      response = error instanceof Error ? error.message : String(error);
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
    provider: artifactKind === "mp3" ? "eliza" : "offline",
    model: artifactKind === "mp3" ? ModelType.TEXT_TO_SPEECH : "offline",
  };
}
