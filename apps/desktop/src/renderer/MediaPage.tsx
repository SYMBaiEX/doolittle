import { OfflineRouteState } from "./components/OfflineRouteState";
import { PageHeader } from "./lib";
import { MediaLibraryTab } from "./media/MediaLibraryTab";

export function MediaPage({
  active,
  embedded = false,
}: {
  active: boolean;
  embedded?: boolean;
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
        <OfflineRouteState>
          Media operations are unavailable until the local runtime is ready.
        </OfflineRouteState>
      ) : (
        <MediaLibraryTab active revision={0} />
      )}
    </div>
  );
}
