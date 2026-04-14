import type { MediaTranscriptionPaths } from "../paths";
import type {
  MediaBundle,
  MediaInspection,
  MediaModelContext,
  MediaTranscriptionBundle,
  MediaTranscriptionOptions,
} from "../types";

export interface MediaTranscriptionDependencies {
  inspect: (path: string) => MediaInspection;
  bundle: (path: string) => MediaBundle;
  buildSignals: (inspection: MediaInspection) => string[];
  requestModelText: (
    prompt: string,
    context: MediaModelContext | undefined,
    metadata: { focus: string; inspection: MediaInspection; signals: string[] },
  ) => Promise<string>;
}

export interface ExecuteMediaTranscriptionInput {
  outputDir: string;
  path: string;
  options?: MediaTranscriptionOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaTranscriptionDependencies;
}

export interface PreparedMediaTranscription {
  outputDir: string;
  path: string;
  options: MediaTranscriptionOptions;
  modelContext?: MediaModelContext;
  dependencies: MediaTranscriptionDependencies;
  inspection: MediaInspection;
  bundle: MediaBundle;
  signals: string[];
  prompt: string;
  paths: MediaTranscriptionPaths;
}

export interface MediaTranscriptionState {
  transcriptText: string;
  response: string;
  source: MediaTranscriptionBundle["source"];
}
