import { OfflineRouteState } from "./components/OfflineRouteState";
import { PageHeader } from "./lib";
import { MediaLibraryTab } from "./media/MediaLibraryTab";

export function MediaPage({
  active,
  botId,
  embedded = false,
  onOpenConversation,
  sessionId,
}: {
  active: boolean;
  botId?: string;
  embedded?: boolean;
  onOpenConversation?: (sessionId: string) => void;
  sessionId?: string;
}) {
  return (
    <div
      className={
        embedded
          ? "flex h-full min-h-0 w-full flex-col overflow-hidden"
          : "page h-full min-h-0 gap-0 overflow-hidden p-0"
      }
    >
      {embedded ? null : (
        <PageHeader
          description="Every generated image, recording, and video—indexed automatically."
          eyebrow="Workspace"
          title="Assets"
        />
      )}

      {!active ? (
        <OfflineRouteState title="Asset library unavailable">
          Open this view when the chat’s agent is ready.
        </OfflineRouteState>
      ) : (
        <MediaLibraryTab
          active
          botId={botId}
          onOpenConversation={onOpenConversation}
          sessionId={sessionId}
        />
      )}
    </div>
  );
}
