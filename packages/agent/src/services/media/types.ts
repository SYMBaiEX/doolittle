import type {
  ConnectorType,
  InteractionMode,
} from "@elizaos/autonomous/services/coding-agent-context";

export interface MediaInspection {
  path: string;
  basename: string;
  extension: string;
  sizeBytes: number;
  kind: "image" | "audio" | "video" | "document" | "unknown";
  mimeType: string;
  exists: boolean;
  isDirectory: boolean;
  detail: string;
  contentHash?: string;
  textPreview?: string;
  lineCount?: number;
  wordCount?: number;
  width?: number;
  height?: number;
  pageCount?: number;
  title?: string;
  author?: string;
  durationMs?: number;
  transcriptPath?: string;
  transcriptPreview?: string;
  captionPath?: string;
  captionPreview?: string;
}

export interface MediaBundle {
  inspection: MediaInspection;
  manifestPath: string;
  reportPath: string;
  relatedFiles: string[];
}

export interface MediaAnalysisBundle {
  focus: "voice" | "vision" | "research";
  inspection: MediaInspection;
  bundle: MediaBundle;
  prompt: string;
  signals: string[];
}

export interface MediaModelAnalysisBundle {
  analysis: MediaAnalysisBundle;
  response: string;
  responsePath: string;
  reportPath: string;
  manifestPath: string;
  model: string;
  provider: string;
}

export interface MediaTranscriptionBundle {
  inspection: MediaInspection;
  bundle: MediaBundle;
  prompt: string;
  transcriptText: string;
  transcriptPath: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  responsePath?: string;
  response?: string;
  model?: string;
  provider?: string;
  source: "openai" | "anthropic" | "sidecar" | "offline";
}

export interface MediaSpeechBundle {
  prompt: string;
  refinedText: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  artifactPath: string;
  artifactKind: "mp3" | "svg";
  response?: string;
  responsePath?: string;
  model?: string;
  provider?: string;
  voice?: string;
}

export interface MediaGenerationBundle {
  prompt: string;
  refinedPrompt: string;
  promptPath: string;
  manifestPath: string;
  reportPath: string;
  artifactPath: string;
  artifactKind: "png" | "svg";
  response?: string;
  responsePath?: string;
  model?: string;
  provider?: string;
}

export interface MediaModelContext {
  provider: "openai" | "anthropic" | "ollama" | "offline";
  model: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  openAiImageModel?: string;
  falApiKey?: string;
}

export interface MediaTextRequestMetadata {
  focus: string;
  inspection?: MediaInspection;
  signals?: string[];
}

export interface MediaGenerationOptions {
  name?: string;
  size?: string;
  style?: string;
  focus?: string;
}

export interface MediaSpeechOptions {
  name?: string;
  voice?: string;
  format?: "mp3" | "svg";
  speed?: number;
}

export interface MediaTranscriptionOptions {
  language?: string;
  prompt?: string;
  name?: string;
}

export interface MediaAnalysisOptions {
  focus?: "auto" | "voice" | "vision" | "research";
}

export interface MediaInspectionServiceOptions {
  workspaceDir: string;
  outputDir: string;
}

export interface MediaAnalysisContextOptions {
  sessionId?: string;
  workingDirectory?: string;
  maxIterations?: number;
  interactionMode?: InteractionMode;
  connectorType?: ConnectorType;
  metadata?: Record<string, string>;
}
