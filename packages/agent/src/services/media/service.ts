import { mkdirSync } from "node:fs";
import {
  inferMediaAnalysisFocus,
  persistMediaAnalysisArtifacts,
} from "./analysis";
import { buildMediaAnalysisPrompt } from "./formatters/analysis";
import {
  generateMediaImageArtifact,
  generateMediaSpeechArtifact,
} from "./generation";
import { MediaInspectionSupport } from "./inspection/service";
import { requestMediaModelText } from "./requests/backends";
import { executeMediaTranscription } from "./transcription";
import type {
  MediaAnalysisBundle,
  MediaAnalysisOptions,
  MediaBundle,
  MediaGenerationBundle,
  MediaGenerationOptions,
  MediaInspection,
  MediaModelAnalysisBundle,
  MediaModelContext,
  MediaSpeechBundle,
  MediaSpeechOptions,
  MediaTranscriptionBundle,
  MediaTranscriptionOptions,
} from "./types";

export class MediaService {
  private readonly inspectionSupport: MediaInspectionSupport;

  constructor(
    private readonly workspaceDir: string,
    private readonly outputDir = ".doolittle/media",
    private readonly getModelContext?: () => MediaModelContext,
  ) {
    mkdirSync(this.outputDir, { recursive: true });
    this.inspectionSupport = new MediaInspectionSupport(
      this.workspaceDir,
      this.outputDir,
    );
  }

  inspect(path: string): MediaInspection {
    return this.inspectionSupport.inspect(path);
  }

  bundle(path: string): MediaBundle {
    return this.inspectionSupport.bundle(path);
  }

  analyze(
    path: string,
    focus: MediaAnalysisOptions["focus"] = "auto",
  ): MediaAnalysisBundle {
    const inspection = this.inspect(path);
    const bundle = this.bundle(path);
    const inferredFocus = inferMediaAnalysisFocus(focus, inspection);

    return {
      focus: inferredFocus,
      inspection,
      bundle,
      prompt: buildMediaAnalysisPrompt(inspection, bundle, inferredFocus),
      signals: this.inspectionSupport.buildSignals(inspection),
    };
  }

  voice(path: string): MediaAnalysisBundle {
    return this.analyze(path, "voice");
  }

  vision(path: string): MediaAnalysisBundle {
    return this.analyze(path, "vision");
  }

  async analyzeWithModel(
    path: string,
    focus: MediaAnalysisOptions["focus"] = "auto",
  ): Promise<MediaModelAnalysisBundle> {
    const analysis = this.analyze(path, focus);
    const modelContext = this.getModelContext?.();
    const response = await requestMediaModelText(
      analysis.prompt,
      modelContext,
      {
        focus: analysis.focus,
        inspection: analysis.inspection,
        signals: analysis.signals,
      },
    );
    return persistMediaAnalysisArtifacts({
      analysis,
      outputDir: this.outputDir,
      modelContext,
      response,
    });
  }

  async voiceWithModel(path: string): Promise<MediaModelAnalysisBundle> {
    return this.analyzeWithModel(path, "voice");
  }

  async visionWithModel(path: string): Promise<MediaModelAnalysisBundle> {
    return this.analyzeWithModel(path, "vision");
  }

  async transcribe(
    path: string,
    options: MediaTranscriptionOptions = {},
  ): Promise<MediaTranscriptionBundle> {
    return executeMediaTranscription({
      outputDir: this.outputDir,
      path,
      options,
      modelContext: this.getModelContext?.(),
      dependencies: {
        inspect: (p) => this.inspect(p),
        bundle: (p) => this.bundle(p),
        buildSignals: (inspection) =>
          this.inspectionSupport.buildSignals(inspection),
        requestModelText: (requestPrompt, modelContext, metadata) =>
          requestMediaModelText(requestPrompt, modelContext, metadata),
      },
    });
  }

  async transcribeWithModel(
    path: string,
    options: MediaTranscriptionOptions = {},
  ): Promise<MediaTranscriptionBundle> {
    return this.transcribe(path, options);
  }

  async generateImage(
    prompt: string,
    options: MediaGenerationOptions = {},
  ): Promise<MediaGenerationBundle> {
    return generateMediaImageArtifact({
      outputDir: this.outputDir,
      prompt,
      options,
      modelContext: this.getModelContext?.(),
      dependencies: {
        requestModelText: (requestPrompt, modelContext, metadata) =>
          requestMediaModelText(requestPrompt, modelContext, metadata),
      },
    });
  }

  async speak(
    text: string,
    options: MediaSpeechOptions = {},
  ): Promise<MediaSpeechBundle> {
    return generateMediaSpeechArtifact({
      outputDir: this.outputDir,
      text,
      options,
      modelContext: this.getModelContext?.(),
      dependencies: {
        requestModelText: (requestPrompt, modelContext, metadata) =>
          requestMediaModelText(requestPrompt, modelContext, metadata),
      },
    });
  }

  async speakWithModel(
    text: string,
    options: MediaSpeechOptions = {},
  ): Promise<MediaSpeechBundle> {
    return this.speak(text, options);
  }
}
