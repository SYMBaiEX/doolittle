import {
  Service as ElizaService,
  type IAgentRuntime,
  type Plugin,
} from "@elizaos/core";

export interface TtsStatus {
  ready: boolean;
  backend: string | null;
  mode: "active" | "degraded";
  configured: boolean;
  detail: string;
}

export interface TtsPluginOptions {
  speech: {
    status(): TtsStatus;
    speak(
      text: string,
      options?: {
        name?: string;
        voice?: string;
        format?: "mp3" | "svg";
        speed?: number;
      },
    ): Promise<unknown>;
  };
}

export function createTtsPlugin(options: TtsPluginOptions): Plugin {
  class TtsService extends ElizaService {
    static serviceType = "tts";

    capabilityDescription =
      "Workspace-native TTS adapter over Doolittle media speech generation with explicit degraded readiness reporting.";

    static async start(runtime?: IAgentRuntime): Promise<TtsService> {
      return new TtsService(runtime);
    }

    async stop(): Promise<void> {}

    status(): TtsStatus {
      return options.speech.status();
    }

    summary(): TtsStatus {
      return this.status();
    }

    speak(
      text: string,
      requestOptions?: {
        name?: string;
        voice?: string;
        format?: "mp3" | "svg";
        speed?: number;
      },
    ) {
      return options.speech.speak(text, requestOptions);
    }
  }

  return {
    name: "@elizaos/plugin-tts",
    description:
      "Workspace-native TTS adapter over Doolittle media speech generation.",
    services: [TtsService],
    providers: [],
    evaluators: [],
    actions: [],
  };
}

export const TTSGenerationPlugin = createTtsPlugin({
  speech: {
    status: () => ({
      ready: false,
      backend: null,
      mode: "degraded",
      configured: false,
      detail:
        "No runtime speech backend is configured for the standalone plugin descriptor.",
    }),
    speak: async (text, requestOptions = {}) => ({
      prompt: text,
      ...requestOptions,
      ready: false,
      backend: null,
      mode: "degraded",
      detail:
        "Speech generation requires the runtime-backed media service and is unavailable in the standalone plugin descriptor.",
    }),
  },
});

export default TTSGenerationPlugin;
