import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { slugifyMediaText } from "../paths";
import type { MediaModelContext } from "../types";
import { renderGenerationSvg } from "./renderers";

export async function requestImageGeneration(input: {
  outputDir: string;
  prompt: string;
  context: MediaModelContext | undefined;
  size?: string;
}): Promise<
  | {
      path: string;
      responsePath?: string;
      response?: string;
      kind: "png" | "svg";
    }
  | undefined
> {
  const fallbackPath = join(
    input.outputDir,
    `media-${Date.now()}-${slugifyMediaText(input.prompt)}.svg`,
  );
  if (!input.context || !input.context.openAiApiKey) {
    writeFileSync(
      fallbackPath,
      renderGenerationSvg(input.prompt, input.size ?? "1024x1024"),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
    };
  }

  const imageModel = input.context.openAiImageModel ?? input.context.model;
  const response = await fetch(`${input.context.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.context.openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: imageModel,
      prompt: input.prompt,
      size: input.size ?? "1024x1024",
      response_format: "b64_json",
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Image generation failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const generated = data.data?.[0];
  if (!generated) {
    return undefined;
  }

  if (generated.b64_json) {
    const path = join(
      input.outputDir,
      `media-${Date.now()}-${slugifyMediaText(input.prompt)}.png`,
    );
    writeFileSync(path, Buffer.from(generated.b64_json, "base64"));
    return {
      path,
      kind: "png",
    };
  }

  if (generated.url) {
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
    writeFileSync(
      responsePath,
      JSON.stringify(
        {
          prompt: input.prompt,
          url: generated.url,
        },
        null,
        2,
      ),
      "utf8",
    );
    return {
      path: fallbackPath,
      kind: "svg",
      response: generated.url,
      responsePath,
    };
  }

  writeFileSync(
    fallbackPath,
    renderGenerationSvg(input.prompt, input.size ?? "1024x1024"),
    "utf8",
  );
  return {
    path: fallbackPath,
    kind: "svg",
  };
}
