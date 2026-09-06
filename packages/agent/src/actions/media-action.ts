import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { getScopedTurnAbortSignal } from "@/runtime/turn-runtime-scope";
import type { AppServices } from "@/services";
import { isMediaAbort } from "@/services/media/abort";

export const DOOLITTLE_MEDIA_ACTIONS = [
  "DOOLITTLE_GENERATE_IMAGE",
  "DOOLITTLE_GENERATE_SPEECH",
  "DOOLITTLE_TRANSCRIBE_MEDIA",
  "DOOLITTLE_ANALYZE_MEDIA",
] as const;

type Parameters = Record<string, unknown>;

function parameters(options: HandlerOptions | undefined): Parameters {
  return options?.parameters && typeof options.parameters === "object"
    ? (options.parameters as Parameters)
    : {};
}

function stringParameter(input: Parameters, name: string): string | undefined {
  const value = input[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberParameter(input: Parameters, name: string): number | undefined {
  const value = input[name];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

async function respond(
  callback: HandlerCallback | undefined,
  result: ActionResult,
): Promise<ActionResult> {
  if (result.text) {
    await callback?.({ text: result.text, source: "doolittle-media-action" });
  }
  return result;
}

function required(name: string): ActionResult {
  const text = `Media action requires a ${name}.`;
  return { success: false, text, userFacingText: text };
}

async function runMediaAction(
  runtime: IAgentRuntime,
  options: HandlerOptions | undefined,
  callback: HandlerCallback | undefined,
  operation: (signal: AbortSignal | undefined) => Promise<ActionResult>,
): Promise<ActionResult> {
  const signal =
    (options as { abortSignal?: AbortSignal } | undefined)?.abortSignal ??
    getScopedTurnAbortSignal(runtime);
  try {
    return await respond(callback, await operation(signal));
  } catch (error) {
    if (isMediaAbort(error, signal)) throw error;
    const text = `Media operation failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return await respond(callback, {
      success: false,
      text,
      userFacingText: text,
    });
  }
}

export function createMediaActions(
  services: Pick<AppServices, "media">,
): Action[] {
  const image: Action = {
    name: DOOLITTLE_MEDIA_ACTIONS[0],
    similes: ["CREATE_IMAGE", "GENERATE_ARTWORK", "MAKE_IMAGE"],
    description:
      "Generate an image with the selected ElizaOS media provider and save it to Doolittle's Assets library.",
    descriptionCompressed: "Generate an image and save it to Assets.",
    routingHint: "create or generate an image -> DOOLITTLE_GENERATE_IMAGE",
    contexts: ["media", "image"],
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      const input = parameters(options);
      const prompt = stringParameter(input, "prompt");
      if (!prompt) return await respond(callback, required("prompt"));
      return await runMediaAction(
        runtime,
        options,
        callback,
        async (signal) => {
          const result = await services.media.generateImage(prompt, {
            name: stringParameter(input, "name"),
            size: stringParameter(input, "size"),
            style: stringParameter(input, "style"),
            focus: stringParameter(input, "focus"),
            signal,
          });
          const text = `Generated image: ${result.artifactPath}`;
          return {
            success: true,
            text,
            userFacingText: text,
            verifiedUserFacing: true,
            data: {
              actionName: DOOLITTLE_MEDIA_ACTIONS[0],
              artifactPath: result.artifactPath,
              manifestPath: result.manifestPath,
              provider: result.provider,
              model: result.model,
            },
          };
        },
      );
    },
    parameters: [
      {
        name: "prompt",
        description: "Description of the image to generate.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "name",
        description: "Optional output name.",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "size",
        description: "Optional provider-supported image size.",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "style",
        description: "Optional visual style guidance.",
        required: false,
        schema: { type: "string" },
      },
    ],
  };

  const speech: Action = {
    name: DOOLITTLE_MEDIA_ACTIONS[1],
    similes: ["CREATE_SPEECH", "TEXT_TO_SPEECH", "GENERATE_AUDIO"],
    description:
      "Generate speech with the selected ElizaOS text-to-speech provider and save it to Doolittle's Assets library.",
    descriptionCompressed: "Generate speech and save it to Assets.",
    routingHint:
      "narrate or turn text into speech -> DOOLITTLE_GENERATE_SPEECH",
    contexts: ["media", "audio"],
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      const input = parameters(options);
      const textInput = stringParameter(input, "text");
      if (!textInput) return await respond(callback, required("text value"));
      return await runMediaAction(
        runtime,
        options,
        callback,
        async (signal) => {
          const format = stringParameter(input, "format");
          const result = await services.media.speak(textInput, {
            name: stringParameter(input, "name"),
            voice: stringParameter(input, "voice"),
            format:
              format === "svg" ? "svg" : format === "mp3" ? "mp3" : undefined,
            speed: numberParameter(input, "speed"),
            signal,
          });
          const text = `Generated speech: ${result.artifactPath}`;
          return {
            success: true,
            text,
            userFacingText: text,
            verifiedUserFacing: true,
            data: {
              actionName: DOOLITTLE_MEDIA_ACTIONS[1],
              artifactPath: result.artifactPath,
              manifestPath: result.manifestPath,
              provider: result.provider,
              model: result.model,
            },
          };
        },
      );
    },
    parameters: [
      {
        name: "text",
        description: "Text to synthesize as speech.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "voice",
        description: "Optional provider-supported voice.",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "speed",
        description: "Optional speech speed.",
        required: false,
        schema: { type: "number", minimum: 0.25, maximum: 4 },
      },
    ],
  };

  const transcribe: Action = {
    name: DOOLITTLE_MEDIA_ACTIONS[2],
    similes: ["TRANSCRIBE_AUDIO", "TRANSCRIBE_VIDEO", "SPEECH_TO_TEXT"],
    description:
      "Transcribe a workspace media file with the selected ElizaOS transcription provider and save a durable transcript.",
    descriptionCompressed: "Transcribe a media file into a durable transcript.",
    routingHint:
      "transcribe an audio or video file -> DOOLITTLE_TRANSCRIBE_MEDIA",
    contexts: ["media", "audio", "video"],
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      const input = parameters(options);
      const path = stringParameter(input, "path");
      if (!path) return await respond(callback, required("file path"));
      return await runMediaAction(
        runtime,
        options,
        callback,
        async (signal) => {
          const result = await services.media.transcribe(path, {
            language: stringParameter(input, "language"),
            prompt: stringParameter(input, "prompt"),
            name: stringParameter(input, "name"),
            signal,
          });
          const text = `Transcribed media: ${result.transcriptPath}`;
          return {
            success: true,
            text,
            userFacingText: text,
            verifiedUserFacing: true,
            data: {
              actionName: DOOLITTLE_MEDIA_ACTIONS[2],
              transcriptPath: result.transcriptPath,
              manifestPath: result.manifestPath,
              provider: result.provider,
              model: result.model,
              source: result.source,
            },
          };
        },
      );
    },
    parameters: [
      {
        name: "path",
        description: "Workspace-relative or absolute path to audio or video.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "language",
        description: "Optional language hint.",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "prompt",
        description: "Optional transcription context.",
        required: false,
        schema: { type: "string" },
      },
    ],
  };

  const analyze: Action = {
    name: DOOLITTLE_MEDIA_ACTIONS[3],
    similes: ["ANALYZE_MEDIA", "INSPECT_MEDIA", "UNDERSTAND_IMAGE"],
    description:
      "Inspect and analyze a workspace media file with Doolittle's Eliza-backed media service, saving a durable report.",
    descriptionCompressed: "Analyze a media file into a durable report.",
    routingHint: "inspect or analyze a media file -> DOOLITTLE_ANALYZE_MEDIA",
    contexts: ["media", "image", "audio", "video"],
    validate: async () => true,
    handler: async (
      runtime: IAgentRuntime,
      _message: Memory,
      _state: State | undefined,
      options: HandlerOptions | undefined,
      callback?: HandlerCallback,
    ) => {
      const input = parameters(options);
      const path = stringParameter(input, "path");
      if (!path) return await respond(callback, required("file path"));
      return await runMediaAction(
        runtime,
        options,
        callback,
        async (signal) => {
          const rawFocus = stringParameter(input, "focus");
          const focus =
            rawFocus === "voice" ||
            rawFocus === "vision" ||
            rawFocus === "research"
              ? rawFocus
              : "auto";
          const result = await services.media.analyzeWithModel(
            path,
            focus,
            signal,
          );
          const text = `Analyzed media: ${result.reportPath}`;
          return {
            success: true,
            text,
            userFacingText: text,
            verifiedUserFacing: true,
            data: {
              actionName: DOOLITTLE_MEDIA_ACTIONS[3],
              reportPath: result.reportPath,
              manifestPath: result.manifestPath,
              provider: result.provider,
              model: result.model,
              focus: result.analysis.focus,
            },
          };
        },
      );
    },
    parameters: [
      {
        name: "path",
        description: "Workspace-relative or absolute path to the media file.",
        required: true,
        schema: { type: "string", minLength: 1 },
      },
      {
        name: "focus",
        description: "Analysis focus: auto, voice, vision, or research.",
        required: false,
        schema: {
          type: "string",
          enum: ["auto", "voice", "vision", "research"],
        },
      },
    ],
  };

  return [image, speech, transcribe, analyze];
}
