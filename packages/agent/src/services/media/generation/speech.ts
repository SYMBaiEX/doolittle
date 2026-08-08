import { writeFileSync } from "node:fs";
import { ModelType } from "@elizaos/core";
import { renderSpeechSvg } from "./renderers";

export async function requestSpeechGeneration(input: {
  script: string;
  voice: string;
  speed?: number;
  preferredFormat: "mp3" | "svg";
  fallbackArtifactPath: string;
  synthesizeSpeech?: (
    text: string,
    options: { voice: string; speed?: number },
  ) => Promise<Uint8Array | undefined>;
}): Promise<{
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  response: string;
  provider: string;
  model: string;
}> {
  let artifactPath = input.fallbackArtifactPath;
  let artifactKind: "mp3" | "svg" = "svg";
  let response = "Generated an offline Doolittle speech concept artifact.";

  if (input.preferredFormat !== "svg" && input.synthesizeSpeech) {
    try {
      const bytes = await input.synthesizeSpeech(input.script, {
        voice: input.voice,
        speed: input.speed,
      });
      if (bytes && bytes.byteLength > 0) {
        artifactPath = artifactPath.replace(/\.svg$/u, ".mp3");
        artifactKind = "mp3";
        writeFileSync(artifactPath, bytes);
        response = `Generated speech through Eliza ${ModelType.TEXT_TO_SPEECH} at ${artifactPath}.`;
      }
    } catch (error) {
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
