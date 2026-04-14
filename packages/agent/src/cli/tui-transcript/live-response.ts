import type { ResponseTranscriptEntry } from "@/cli/transcript-renderer";
import {
  baseLabelForLiveKind,
  createPendingRunLabel,
  nowStamp,
} from "./labels";
import type { TuiTranscriptOptions } from "./types";

export function buildLiveResponse(input: {
  label: string;
  body: string;
  liveToolTrail: string[];
  options: TuiTranscriptOptions;
  kind?: ResponseTranscriptEntry["kind"];
  pending?: boolean;
}): ResponseTranscriptEntry {
  return {
    label: input.pending
      ? createPendingRunLabel({
          baseLabel: input.label,
          context: input.options.context,
          state: input.options.state,
          truncate: input.options.truncate,
          isBusy: input.options.isBusy(),
        })
      : input.label,
    body: input.body.trim(),
    at: nowStamp(),
    kind: input.kind,
    pending: input.pending,
    liveActivity:
      input.liveToolTrail.length > 0
        ? input.liveToolTrail.slice(-4)
        : undefined,
  };
}

export function baseLiveLabel(
  agentName: string,
  kind: ResponseTranscriptEntry["kind"] | undefined,
): string {
  return baseLabelForLiveKind(agentName, kind);
}
