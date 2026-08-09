import { PagePanel } from "@elizaos/ui/components/composites/page-panel";
import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@elizaos/ui/components/ui/tabs";
import { type FormEvent, useState } from "react";
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
  ErrorBlock,
  formatBoundedPreview,
  LoadingBlock,
  MetricCard,
  Notice,
  PageHeader,
  type UnknownRecord,
  useApiResource,
} from "./lib";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  type MemoryMatchesResponse,
  normalizeSavedProfileMatches,
} from "./memory-matches";

const BOUNDS = {
  memorySnapshotChars: 1_400,
  mediaResultChars: 2_400,
  memoryPreviewItems: 5,
  agentCardChars: 1_000,
};

const DESKTOP_PROFILE_USER_ID = "desktop-user";

interface MemorySummary {
  target?: "memory" | "user" | string;
  entries?: number;
  characters?: number;
  preview?: unknown[];
}

interface MemoryResponse {
  target?: string;
  summary?: MemorySummary;
  snapshot?: string;
}

interface ProfileSummaryResponse {
  summary?: UnknownRecord;
}

interface AgentProfileResponse {
  card?: unknown;
  summary?: UnknownRecord;
}

export function MemoryPage({ active }: { active: boolean }) {
  const tabs = ["memory", "user"] as const;
  const [target, setTarget] = useState<(typeof tabs)[number]>("memory");
  const [recallDraft, setRecallDraft] = useState("");
  const [submittedRecallQuery, setSubmittedRecallQuery] = useState("");
  const memoryResource = useApiResource<MemoryResponse>(
    active ? "/memory?target=memory" : null,
    [active],
  );
  const userResource = useApiResource<MemoryResponse>(
    active ? "/memory?target=user" : null,
    [active],
  );
  const resource = target === "memory" ? memoryResource : userResource;
  const targetLabel = target === "memory" ? "Shared memory" : "User memory";
  const summary = asRecord(resource.data?.summary) as MemorySummary;
  const snapshot = asString(resource.data?.snapshot, "");
  const preview = asArray(summary.preview)
    .slice(-BOUNDS.memoryPreviewItems)
    .map((entry) => asString(entry));
  const profileSummaryResource = useApiResource<ProfileSummaryResponse>(
    active ? "/profiles/summary" : null,
    [active],
  );
  const agentProfileResource = useApiResource<AgentProfileResponse>(
    active ? "/profiles/agent" : null,
    [active],
  );
  const recallResource = useApiResource<MemoryMatchesResponse>(
    active && canRecallSavedProfileMatches(submittedRecallQuery)
      ? `/profiles/users/recall?userId=${encodeURIComponent(
          DESKTOP_PROFILE_USER_ID,
        )}&query=${encodeURIComponent(submittedRecallQuery)}`
      : null,
    [active, submittedRecallQuery],
  );
  const profileSummary = asRecord(profileSummaryResource.data?.summary);
  const agentCard = formatBoundedPreview(
    agentProfileResource.data?.card,
    BOUNDS.agentCardChars,
  );
  const recallMatches = normalizeSavedProfileMatches(recallResource.data);
  const recallSnapshot = freezeMemoryMatchSnapshot(
    recallDraft,
    submittedRecallQuery,
    recallMatches,
  );
  const submittedRecallTooShort =
    submittedRecallQuery.length > 0 &&
    !canRecallSavedProfileMatches(submittedRecallQuery);

  const submitRecall = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedRecallQuery(recallDraft.trim());
  };

  return (
    <PagePanel className="page studio-page memory-page" variant="workspace">
      <PageHeader
        eyebrow="Operator Workspace"
        title="Memory"
        description="Read memory snapshots for shared and user targets, with explicit load states and bounded previews."
        actions={
          <Button
            className="secondary-button"
            onClick={resource.reload}
            type="button"
            variant="secondary"
            disabled={!active}
          >
            Refresh
          </Button>
        }
      />
      <Tabs
        className="memory-tabs"
        onValueChange={(value) => setTarget(value as (typeof tabs)[number])}
        value={target}
      >
        <TabsList aria-label="Memory target selector">
          {tabs.map((tab) => (
            <TabsTrigger key={tab} className="text-button" value={tab}>
              {tab === "memory" ? "Shared memory" : "User memory"}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent id="memory-target-panel" aria-live="polite" value={target}>
          {resource.loading ? (
            <LoadingBlock label={`Loading ${target} memory snapshot…`} />
          ) : resource.error ? (
            <ErrorBlock error={resource.error} retry={resource.reload} />
          ) : resource.data ? (
            <div className="memory-content two-column-grid">
              <section className="content-card memory-summary-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Summary</span>
                    <h2>{targetLabel}</h2>
                  </div>
                  <Badge>{target === "memory" ? "Shared" : "User"}</Badge>
                </div>
                <div className="card-grid">
                  <MetricCard
                    label="Entries"
                    value={asNumber(summary.entries, 0)}
                  />
                  <MetricCard
                    label="Characters"
                    value={asNumber(summary.characters, 0)}
                  />
                  <MetricCard
                    label="Target"
                    value={
                      asString(summary.target, target) === "memory"
                        ? "Shared"
                        : "User"
                    }
                  />
                </div>
              </section>

              <section className="content-card memory-summary-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Recent entries</span>
                    <h2>Preview</h2>
                  </div>
                </div>
                {preview.length ? (
                  <ul>
                    {preview.map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <EmptyBlock title="No entries">
                    No memory entries were found.
                  </EmptyBlock>
                )}
              </section>

              <section className="content-card memory-summary-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Readable snapshot</span>
                    <h2>Latest bounded snapshot</h2>
                  </div>
                  <Notice tone={snapshot ? "good" : "warn"}>
                    {snapshot ? "Loaded" : "Unavailable"}
                  </Notice>
                </div>
                {snapshot ? (
                  <pre className="json-preview">
                    {formatBoundedPreview(snapshot, BOUNDS.memorySnapshotChars)}
                  </pre>
                ) : (
                  <EmptyBlock title="No snapshot">
                    Snapshot is empty.
                  </EmptyBlock>
                )}
              </section>

              <section className="content-card memory-summary-card memory-operator-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Operator recall</span>
                    <h2>Profile search</h2>
                  </div>
                  <Badge tone={submittedRecallTooShort ? "warn" : "neutral"}>
                    {recallSnapshot
                      ? `${recallSnapshot.count} match${
                          recallSnapshot.count === 1 ? "" : "es"
                        }`
                      : "Desktop user"}
                  </Badge>
                </div>
                <form className="memory-recall-form" onSubmit={submitRecall}>
                  <label htmlFor="memory-recall-query">
                    <span className="sr-only">Recall query</span>
                    <Input
                      id="memory-recall-query"
                      type="text"
                      value={recallDraft}
                      onChange={(event) => setRecallDraft(event.target.value)}
                      placeholder="Search saved profile details"
                    />
                  </label>
                  <Button
                    className="secondary-button"
                    type="submit"
                    variant="secondary"
                    disabled={!active || !recallDraft.trim()}
                  >
                    Recall
                  </Button>
                </form>
                {submittedRecallTooShort ? (
                  <Notice tone="warn">
                    Use at least {4} characters so recall stays specific.
                  </Notice>
                ) : recallResource.loading ? (
                  <LoadingBlock label="Recalling saved profile matches…" />
                ) : recallResource.error ? (
                  <ErrorBlock
                    error={recallResource.error}
                    retry={recallResource.reload}
                  />
                ) : recallMatches.length ? (
                  <ul className="memory-match-list">
                    {recallMatches.map((match) => (
                      <li key={`${match.kind}:${match.value}`}>
                        <Badge>{match.kind}</Badge>
                        <span>{match.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : submittedRecallQuery ? (
                  <EmptyBlock title="No recalled matches">
                    No saved profile details matched this query.
                  </EmptyBlock>
                ) : (
                  <Notice>
                    Search the saved profile memory for the current desktop
                    user.
                  </Notice>
                )}
              </section>

              <section className="content-card memory-summary-card memory-operator-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Profile workspace</span>
                    <h2>Rolodex summary</h2>
                  </div>
                  <Badge>
                    {asString(profileSummary.agentName, "Doolittle")}
                  </Badge>
                </div>
                {profileSummaryResource.loading ? (
                  <LoadingBlock label="Loading profile summary…" />
                ) : profileSummaryResource.error ? (
                  <ErrorBlock
                    error={profileSummaryResource.error}
                    retry={profileSummaryResource.reload}
                  />
                ) : (
                  <div className="card-grid">
                    <MetricCard
                      label="Profiles"
                      value={asNumber(profileSummary.totalProfiles, 0)}
                    />
                    <MetricCard
                      label="Beliefs"
                      value={asNumber(profileSummary.totalBeliefs, 0)}
                    />
                    <MetricCard
                      label="Trusted"
                      value={asNumber(profileSummary.trustedRelationships, 0)}
                    />
                    <MetricCard
                      label="Engaged"
                      value={asNumber(profileSummary.engagedProfiles, 0)}
                    />
                  </div>
                )}
              </section>

              <section className="content-card memory-summary-card memory-agent-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">Agent profile</span>
                    <h2>Operator card</h2>
                  </div>
                  <Button
                    className="text-button"
                    onClick={agentProfileResource.reload}
                    type="button"
                    variant="ghost"
                    disabled={!active}
                  >
                    Refresh card
                  </Button>
                </div>
                {agentProfileResource.loading ? (
                  <LoadingBlock label="Loading agent profile…" />
                ) : agentProfileResource.error ? (
                  <ErrorBlock
                    error={agentProfileResource.error}
                    retry={agentProfileResource.reload}
                  />
                ) : agentCard ? (
                  <pre className="json-preview">{agentCard}</pre>
                ) : (
                  <EmptyBlock title="No agent card">
                    The runtime did not return an agent profile card.
                  </EmptyBlock>
                )}
              </section>
            </div>
          ) : (
            <EmptyBlock
              title={
                active
                  ? "Memory is ready for its first entry"
                  : "Memory is offline"
              }
              actions={
                <Button
                  className="secondary-button"
                  disabled={!active}
                  onClick={resource.reload}
                  type="button"
                  variant="secondary"
                >
                  Refresh memory
                </Button>
              }
            >
              {active
                ? "Start a conversation or save an operator detail, then refresh this workspace."
                : "Restart the local runtime to load shared and user memory."}
            </EmptyBlock>
          )}
        </TabsContent>
      </Tabs>
    </PagePanel>
  );
}
