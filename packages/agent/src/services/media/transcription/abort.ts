import { isMediaAbort, throwIfMediaAborted } from "../abort";

export const throwIfTranscriptionAborted = throwIfMediaAborted;
export const isTranscriptionAbort = isMediaAbort;
