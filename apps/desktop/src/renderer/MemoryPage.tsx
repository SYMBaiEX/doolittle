import { Tabs, TabsContent } from "@elizaos/ui/components/ui/tabs";
import {
  BookOpen,
  Brain,
  Contact,
  FolderOpen,
  RotateCw,
  UserRound,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { OfflineRouteState } from "./components/OfflineRouteState";
import { WorkbenchAction } from "./components/workbench/Workbench";
import { useApiResource } from "./lib";
import { MemoryProfilesPanel } from "./memory/MemoryProfilesPanel";
import { MemorySnapshotPanel } from "./memory/MemorySnapshotPanel";
import {
  type AgentProfileResponse,
  type MemoryResponse,
  type MemorySection,
  memoryResourcePolicy,
  type ProfileSummaryResponse,
} from "./memory/models";
import { DiagnosticWorkspace } from "./runtime-state/DiagnosticWorkspace";
import {
  RuntimeSectionNav,
  type RuntimeSectionOption,
} from "./runtime-state/RuntimeSectionNav";

const ProjectKnowledgePanel = lazy(async () => ({
  default: (await import("./memory/ProjectKnowledgePanel"))
    .ProjectKnowledgePanel,
}));

const MEMORY_SECTIONS: Array<
  RuntimeSectionOption<MemorySection> & { refreshLabel: string }
> = [
  {
    detail: "Private memory for the application's Doolittle bot",
    icon: Brain,
    id: "shared",
    label: "Doolittle memory",
    refreshLabel: "shared",
  },
  {
    detail: "Explicitly promoted findings and per-bot access",
    icon: FolderOpen,
    id: "project",
    label: "Shared knowledge",
    refreshLabel: "knowledge",
  },
  {
    detail: "Saved operator details for the current desktop user",
    icon: UserRound,
    id: "user",
    label: "User",
    refreshLabel: "user",
  },
  {
    detail: "Profile inventory, agent card, and bounded recall",
    icon: Contact,
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
    if (section === "project")
      window.dispatchEvent(new Event("doolittle:knowledge-changed"));
    if (policy.shared) sharedMemory.reload();
    if (policy.user) userMemory.reload();
    if (policy.profiles) {
      profileSummary.reload();
      agentProfile.reload();
    }
  };

  return (
    <DiagnosticWorkspace
      actions={
        <WorkbenchAction
          disabled={!active}
          icon={RotateCw}
          onClick={reloadVisibleSection}
        >
          Refresh{" "}
          {MEMORY_SECTIONS.find((entry) => entry.id === section)?.refreshLabel}
        </WorkbenchAction>
      }
      className="@container/memory"
      description="Browse private memory, shared project findings, and saved profile details."
      icon={BookOpen}
      title="Memory & recall"
      titleHidden
    >
      {!active ? (
        <OfflineRouteState>
          Memory snapshots and profile recall are unavailable until the local
          runtime is ready.
        </OfflineRouteState>
      ) : (
        <Tabs
          className="grid min-h-0 content-start gap-2.5"
          onValueChange={(value) => setSection(value as MemorySection)}
          value={section}
        >
          <RuntimeSectionNav
            ariaLabel="Memory workspaces"
            sections={MEMORY_SECTIONS}
          />

          <TabsContent value="shared">
            <MemorySnapshotPanel
              active={active}
              resource={sharedMemory}
              target="memory"
            />
          </TabsContent>
          <TabsContent value="user">
            <MemorySnapshotPanel
              active={active}
              resource={userMemory}
              target="user"
            />
          </TabsContent>
          <TabsContent value="profiles">
            <MemoryProfilesPanel
              active={policy.profiles}
              agentProfile={agentProfile}
              profileSummary={profileSummary}
            />
          </TabsContent>
          <TabsContent value="project">
            <Suspense
              fallback={<p role="status">Loading project knowledge…</p>}
            >
              <ProjectKnowledgePanel active={active && section === "project"} />
            </Suspense>
          </TabsContent>
        </Tabs>
      )}
    </DiagnosticWorkspace>
  );
}
