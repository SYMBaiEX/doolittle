import { createPreloadedComponent } from "../app-shell/preloaded-component";
import type { ChatComposerProps } from "./ChatComposer";
import type { ChatTranscriptProps } from "./ChatTranscript";

export const chatComposerModule = createPreloadedComponent<ChatComposerProps>(
  () =>
    import("./ChatComposer").then(({ ChatComposer }) => ({
      default: ChatComposer,
    })),
);

export const chatTranscriptModule =
  createPreloadedComponent<ChatTranscriptProps>(() =>
    import("./ChatTranscript").then(({ ChatTranscript }) => ({
      default: ChatTranscript,
    })),
  );
