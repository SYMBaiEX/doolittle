import { mkdirSync } from "node:fs";
import type { WorkspaceDirectorySource } from "../workspace-directory";
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
import { buildOfflineMediaTextResponse } from "./requests/backends";
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
  MediaTextAnalysisPort,
  MediaTextRequestMetadata,
  MediaTranscriptionBundle,
  MediaTranscriptionOptions,
} from "./types";

export class MediaService {
  private readonly inspectionSupport: MediaInspectionSupport;

  constructor(
    workspaceDirectory: WorkspaceDirectorySource,
    private readonly outputDir = ".doolittle/media",
    private readonly getModelContext?: () => MediaModelContext,
    private readonly textAnalysisPort?: MediaTextAnalysisPort,
  ) {
    mkdirSync(this.outputDir, { recursive: true });
    this.inspectionSupport = new MediaInspectionSupport(
      workspaceDirectory,
      this.outputDir,
    );
  }

  bindRuntime(
    runtime: Parameters<MediaTextAnalysisPort["bindRuntime"]>[0],
  ): void {
    this.textAnalysisPort?.bindRuntime(runtime);
  }

  private requestTextAnalysis(
    prompt: string,
    metadata: MediaTextRequestMetadata,
  ): Promise<string> {
    return this.textAnalysisPort
      ? this.textAnalysisPort.analyze(prompt)
      : Promise.resolve(buildOfflineMediaTextResponse(prompt, metadata));
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
    const metadata = {
      focus: analysis.focus,
      inspection: analysis.inspection,
      signals: analysis.signals,
    };
    const response = await this.requestTextAnalysis(analysis.prompt, metadata);
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
        requestModelText: (requestPrompt, _modelContext, metadata) =>
          this.requestTextAnalysis(requestPrompt, metadata),
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
        requestModelText: (requestPrompt, _modelContext, metadata) =>
          this.requestTextAnalysis(requestPrompt, metadata),
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
        requestModelText: (requestPrompt, _modelContext, metadata) =>
          this.requestTextAnalysis(requestPrompt, metadata),
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
