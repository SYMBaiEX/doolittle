import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "@elizaos/agent/utils/atomic-json";
import { fetchRemoteMedia, ModelType } from "@elizaos/core";
import type { ElizaImageGenerationResult } from "../eliza-runtime";
import { slugifyMediaText } from "../paths";
import { renderGenerationSvg } from "./renderers";

const MAX_GENERATED_IMAGE_BYTES = 50 * 1024 * 1024;

export async function requestImageGeneration(input: {
  outputDir: string;
  prompt: string;
  size?: string;
  generateImage?: (
    prompt: string,
    size: string,
  ) => Promise<ElizaImageGenerationResult | undefined>;
}): Promise<{
  path: string;
  responsePath?: string;
  response?: string;
  kind: "png" | "svg";
  provider: string;
  model: string;
}> {
  const fallbackPath = join(
    input.outputDir,
    `media-${Date.now()}-${slugifyMediaText(input.prompt)}.svg`,
  );
  if (!input.generateImage) {
    writeFileSync(
      fallbackPath,
      renderGenerationSvg(input.prompt, input.size ?? "1024x1024"),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
      provider: "offline",
      model: "offline",
    };
  }

  let generated: ElizaImageGenerationResult | undefined;
  try {
    generated = await input.generateImage(
      input.prompt,
      input.size ?? "1024x1024",
    );
  } catch (error) {
    writeFileSync(
      fallbackPath,
      renderGenerationSvg(input.prompt, input.size ?? "1024x1024", [
        error instanceof Error ? error.message : String(error),
      ]),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
      response: error instanceof Error ? error.message : String(error),
      provider: "eliza",
      model: ModelType.IMAGE,
    };
  }
  if (!generated) {
    writeFileSync(
      fallbackPath,
      renderGenerationSvg(input.prompt, input.size ?? "1024x1024"),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
      provider: "offline",
      model: "offline",
    };
  }

  const inlineBase64 = generated.url?.match(
    /^data:image\/[a-z0-9.+-]+;base64,(.+)$/iu,
  )?.[1];
  const imageBase64 = generated.base64 ?? inlineBase64;
  if (imageBase64) {
    const path = join(
      input.outputDir,
      `media-${Date.now()}-${slugifyMediaText(input.prompt)}.png`,
    );
    writeFileSync(path, Buffer.from(imageBase64, "base64"));
    return {
      path,
      kind: "png",
      provider: "eliza",
      model: ModelType.IMAGE,
    };
  }

  if (generated.url) {
    try {
      const { buffer } = await fetchRemoteMedia({
        url: generated.url,
        maxBytes: MAX_GENERATED_IMAGE_BYTES,
      });
      const path = join(
        input.outputDir,
        `media-${Date.now()}-${slugifyMediaText(input.prompt)}.png`,
      );
      writeFileSync(path, buffer);
      return {
        path,
        kind: "png",
        response: generated.url,
        provider: "eliza",
        model: ModelType.IMAGE,
      };
    } catch {
      writeFileSync(
        fallbackPath,
        renderGenerationSvg(input.prompt, input.size ?? "1024x1024", [
          `Generated image URL: ${generated.url}`,
        ]),
        "utf8",
      );
      const responsePath = join(
        input.outputDir,
        `media-${Date.now()}-${slugifyMediaText(input.prompt)}.json`,
      );
      writeJsonAtomicSync(responsePath, {
        prompt: input.prompt,
        url: generated.url,
      });
      return {
        path: fallbackPath,
        kind: "svg",
        response: generated.url,
        responsePath,
        provider: "eliza",
        model: ModelType.IMAGE,
      };
    }
  }

  writeFileSync(
    fallbackPath,
    renderGenerationSvg(input.prompt, input.size ?? "1024x1024"),
    "utf8",
  );
  return {
    path: fallbackPath,
    kind: "svg",
    provider: "offline",
    model: "offline",
  };
}
