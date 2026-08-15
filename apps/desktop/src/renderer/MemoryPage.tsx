import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { Tabs, TabsContent } from "@elizaos/ui/components/ui/tabs";
import { useState } from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { PageHeader, useApiResource } from "./lib";
import { MemoryProfilesPanel } from "./memory/MemoryProfilesPanel";
import { MemorySnapshotPanel } from "./memory/MemorySnapshotPanel";
import {
  type AgentProfileResponse,
  type MemoryResponse,
  type MemorySection,
  memoryResourcePolicy,
  type ProfileSummaryResponse,
} from "./memory/models";
import { RuntimeSectionNav } from "./runtime-state/RuntimeSectionNav";

const MEMORY_PAGE_CLASS = "page gap-2.5";

const MEMORY_SECTIONS: Array<{
  detail: string;
  id: MemorySection;
  label: string;
  refreshLabel: string;
}> = [
  {
    detail: "Conversation knowledge available across the workspace",
    id: "shared",
    label: "Shared",
    refreshLabel: "shared",
  },
  {
    detail: "Saved operator details for the current desktop user",
    id: "user",
    label: "User",
    refreshLabel: "user",
  },
  {
    detail: "Profile inventory, agent card, and bounded recall",
    id: "profiles",
    label: "Profiles & recall",
    refreshLabel: "profiles",
  },
];

export function MemoryPage({ active }: { active: boolean }) {
  const [section, setSection] = useState<MemorySection>("shared");
  const policy = memoryResourcePolicy(section, active);
  const sharedMemory = useApiResource<MemoryResponse>(
    policy.shared ? "/memory?target=memory" : null,
    [policy.shared],
  );
  const userMemory = useApiResource<MemoryResponse>(
    policy.user ? "/memory?target=user" : null,
    [policy.user],
  );
  const profileSummary = useApiResource<ProfileSummaryResponse>(
    policy.profiles ? "/profiles/summary" : null,
    [policy.profiles],
  );
  const agentProfile = useApiResource<AgentProfileResponse>(
    policy.profiles ? "/profiles/agent" : null,
    [policy.profiles],
  );

  const reloadVisibleSection = () => {
    if (!active) return;
    if (policy.shared) sharedMemory.reload();
    if (policy.user) userMemory.reload();
    if (policy.profiles) {
      profileSummary.reload();
      agentProfile.reload();
    }
  };

  if (!active) {
    return (
      <PagePanel className={MEMORY_PAGE_CLASS} variant="workspace">
        <PageHeader
          actions={
            <Button
              className="secondary-button"
              disabled
              onClick={reloadVisibleSection}
              type="button"
              variant="secondary"
            >
              Refresh memory
            </Button>
          }
          description="Inspect bounded memory targets and operator profile recall."
          eyebrow="Operator Workspace"
          title="Memory"
        />
        <OfflineRouteState>
          Memory snapshots and profile recall are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      </PagePanel>
    );
  }

  return (
    <PagePanel className={MEMORY_PAGE_CLASS} variant="workspace">
      <PageHeader
        actions={
          <Button
            className="secondary-button"
            disabled={!active}
            onClick={reloadVisibleSection}
            type="button"
            variant="secondary"
          >
            Refresh{" "}
            {
              MEMORY_SECTIONS.find((entry) => entry.id === section)
                ?.refreshLabel
            }
          </Button>
        }
        description="Inspect shared knowledge, saved operator details, and bounded profile recall."
        eyebrow="Operator Workspace"
        title="Memory"
      />
      <Tabs
        className="grid min-h-0 content-start gap-2.5"
        onValueChange={(value) => setSection(value as MemorySection)}
        value={section}
      >
        <RuntimeSectionNav
          ariaLabel="Memory workspaces"
          sections={MEMORY_SECTIONS}
        />

        <TabsContent aria-live="polite" value="shared">
          <MemorySnapshotPanel
            active={active}
            resource={sharedMemory}
            target="memory"
          />
        </TabsContent>
        <TabsContent aria-live="polite" value="user">
          <MemorySnapshotPanel
            active={active}
            resource={userMemory}
            target="user"
          />
        </TabsContent>
        <TabsContent aria-live="polite" value="profiles">
          <MemoryProfilesPanel
            active={policy.profiles}
            agentProfile={agentProfile}
            profileSummary={profileSummary}
          />
        </TabsContent>
      </Tabs>
    </PagePanel>
  );
}
