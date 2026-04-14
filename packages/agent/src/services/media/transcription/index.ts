import { executeMediaTranscription as executeMediaTranscriptionImpl } from "./execute";
import type { MediaTranscriptionDependencies as MediaTranscriptionDependenciesShape } from "./types";

export interface MediaTranscriptionDependencies
  extends MediaTranscriptionDependenciesShape {}

export const executeMediaTranscription = executeMediaTranscriptionImpl;
