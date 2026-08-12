import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@elizaos/ui/components/ui/tabs";
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

const MEMORY_SECTIONS: Array<{
  id: MemorySection;
  label: string;
}> = [
  { id: "shared", label: "Shared memory" },
  { id: "user", label: "User memory" },
  { id: "profiles", label: "Profiles & recall" },
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
      <PagePanel className="page studio-page memory-page" variant="workspace">
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
    <PagePanel className="page studio-page memory-page" variant="workspace">
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
            {MEMORY_SECTIONS.find((entry) => entry.id === section)?.label}
          </Button>
        }
        description="Inspect one bounded memory target at a time, then move to profile recall only when you need operator context."
        eyebrow="Operator Workspace"
        title="Memory"
      />
      <Tabs
        className="memory-workspace"
        onValueChange={(value) => setSection(value as MemorySection)}
        value={section}
      >
        <TabsList aria-label="Memory workspaces" className="memory-tabs">
          {MEMORY_SECTIONS.map((entry) => (
            <TabsTrigger
              className="text-button"
              key={entry.id}
              value={entry.id}
            >
              {entry.label}
            </TabsTrigger>
          ))}
        </TabsList>

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
