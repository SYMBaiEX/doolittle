import { Input } from "@doolittle/ui";
import { Contact, RotateCw, Search, UserRound } from "lucide-react";
import { type FormEvent, useState } from "react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "../components/workbench/Workbench";
import {
  type ApiResource,
  asNumber,
  asRecord,
  asString,
  Badge,
  ErrorBlock,
  formatBoundedPreview,
  LoadingBlock,
  Notice,
  useApiResource,
} from "../lib";
import {
  canRecallSavedProfileMatches,
  freezeMemoryMatchSnapshot,
  type MemoryMatchesResponse,
  normalizeSavedProfileMatches,
} from "../memory-matches";
import { MEMORY_GRID_CLASS, MEMORY_PREVIEW_CLASS } from "./memory-layout";
import type { AgentProfileResponse, ProfileSummaryResponse } from "./models";

const DESKTOP_PROFILE_USER_ID = "desktop-user";
const AGENT_CARD_CHARACTER_LIMIT = 1_000;

export function MemoryProfilesPanel({
  active,
  agentProfile,
  profileSummary,
}: {
  active: boolean;
  agentProfile: ApiResource<AgentProfileResponse>;
  profileSummary: ApiResource<ProfileSummaryResponse>;
}) {
  const [recallDraft, setRecallDraft] = useState("");
  const [submittedRecallQuery, setSubmittedRecallQuery] = useState("");
  const recallResource = useApiResource<MemoryMatchesResponse>(
    active && canRecallSavedProfileMatches(submittedRecallQuery)
      ? `/profiles/users/recall?userId=${encodeURIComponent(
          DESKTOP_PROFILE_USER_ID,
        )}&query=${encodeURIComponent(submittedRecallQuery)}`
      : null,
    [active, submittedRecallQuery],
  );
  const summary = asRecord(profileSummary.data?.summary);
  const agentCard = formatBoundedPreview(
    agentProfile.data?.card,
    AGENT_CARD_CHARACTER_LIMIT,
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
    <div className={MEMORY_GRID_CLASS}>
      <WorkbenchSection
        headingLevel={3}
        icon={Search}
        title="Profile search"
        actions={
          <Badge tone={submittedRecallTooShort ? "warn" : "neutral"}>
            {recallSnapshot
              ? `${recallSnapshot.count} match${recallSnapshot.count === 1 ? "" : "es"}`
              : "Desktop user"}
          </Badge>
        }
      >
        <form
          className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[7px]"
          onSubmit={submitRecall}
        >
          <label htmlFor="memory-recall-query">
            <span className="sr-only">Recall query</span>
            <Input
              id="memory-recall-query"
              onChange={(event) => setRecallDraft(event.target.value)}
              placeholder="Search saved profile details"
              type="text"
              value={recallDraft}
            />
          </label>
          <WorkbenchAction
            disabled={!active || !recallDraft.trim()}
            emphasis="primary"
            icon={Search}
            type="submit"
          >
            Recall
          </WorkbenchAction>
        </form>
        {submittedRecallTooShort ? (
          <Notice tone="warn">
            Use at least 4 characters so recall stays specific.
          </Notice>
        ) : recallResource.loading ? (
          <LoadingBlock label="Recalling saved profile matches…" />
        ) : recallResource.error ? (
          <ErrorBlock
            error={recallResource.error}
            retry={recallResource.reload}
          />
        ) : recallMatches.length ? (
          <ul className="m-0 grid list-none gap-1 p-0">
            {recallMatches.map((match) => (
              <li
                className="grid gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-soft)] px-2 py-1.5 [overflow-wrap:anywhere] [&_.badge]:w-fit"
                key={`${match.kind}:${match.value}`}
              >
                <Badge>{match.kind}</Badge>
                <span>{match.value}</span>
              </li>
            ))}
          </ul>
        ) : submittedRecallQuery ? (
          <WorkbenchEmpty icon={Search} title="No recalled matches">
            No saved profile details matched this query.
          </WorkbenchEmpty>
        ) : (
          <WorkbenchEmpty icon={Search} title="Search profile memory">
            Enter at least four characters to look up saved details.
          </WorkbenchEmpty>
        )}
      </WorkbenchSection>

      <WorkbenchSection
        actions={<Badge>{asString(summary.agentName, "Doolittle")}</Badge>}
        headingLevel={3}
        icon={Contact}
        title="Rolodex summary"
      >
        {profileSummary.loading ? (
          <LoadingBlock label="Loading profile summary…" />
        ) : profileSummary.error ? (
          <ErrorBlock
            error={profileSummary.error}
            retry={profileSummary.reload}
          />
        ) : (
          <CompactStatStrip
            label="Rolodex summary"
            stats={[
              { label: "Profiles", value: asNumber(summary.totalProfiles, 0) },
              { label: "Beliefs", value: asNumber(summary.totalBeliefs, 0) },
              {
                label: "Trusted",
                value: asNumber(summary.trustedRelationships, 0),
              },
              { label: "Engaged", value: asNumber(summary.engagedProfiles, 0) },
            ]}
          />
        )}
      </WorkbenchSection>

      <WorkbenchSection
        actions={
          <WorkbenchAction
            disabled={!active}
            emphasis="quiet"
            icon={RotateCw}
            onClick={agentProfile.reload}
          >
            Refresh card
          </WorkbenchAction>
        }
        className="col-span-full"
        headingLevel={3}
        icon={UserRound}
        title="Operator card"
      >
        {agentProfile.loading ? (
          <LoadingBlock label="Loading agent profile…" />
        ) : agentProfile.error ? (
          <ErrorBlock error={agentProfile.error} retry={agentProfile.reload} />
        ) : agentCard ? (
          <pre className={MEMORY_PREVIEW_CLASS}>{agentCard}</pre>
        ) : (
          <WorkbenchEmpty icon={UserRound} title="No agent card">
            The runtime did not return an agent profile card.
          </WorkbenchEmpty>
        )}
      </WorkbenchSection>
    </div>
  );
}
