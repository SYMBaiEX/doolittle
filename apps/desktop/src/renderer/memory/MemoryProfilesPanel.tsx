import { Button } from "@elizaos/ui/components/ui/button";
import { Input } from "@elizaos/ui/components/ui/input";
import { type FormEvent, useState } from "react";
import { CompactStatStrip } from "../components/CompactStatStrip";
import {
  type ApiResource,
  asNumber,
  asRecord,
  asString,
  Badge,
  EmptyBlock,
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
import {
  MEMORY_CARD_CLASS,
  MEMORY_GRID_CLASS,
  MEMORY_HEADING_CLASS,
  MEMORY_PREVIEW_CLASS,
} from "./memory-layout";
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
      <section className={`${MEMORY_CARD_CLASS} min-h-0`}>
        <div className={MEMORY_HEADING_CLASS}>
          <div>
            <span className="eyebrow">Operator recall</span>
            <h2>Profile search</h2>
          </div>
          <Badge tone={submittedRecallTooShort ? "warn" : "neutral"}>
            {recallSnapshot
              ? `${recallSnapshot.count} match${recallSnapshot.count === 1 ? "" : "es"}`
              : "Desktop user"}
          </Badge>
        </div>
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
          <Button
            className="secondary-button"
            disabled={!active || !recallDraft.trim()}
            type="submit"
            variant="secondary"
          >
            Recall
          </Button>
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
          <ul className="m-0 grid list-none gap-0 border-t border-[var(--line-subtle)] p-0">
            {recallMatches.map((match) => (
              <li
                className="grid gap-[5px] border-0 border-b border-[var(--line-subtle)] bg-transparent px-0 py-[7px] [&_.badge]:w-fit"
                key={`${match.kind}:${match.value}`}
              >
                <Badge>{match.kind}</Badge>
                <span>{match.value}</span>
              </li>
            ))}
          </ul>
        ) : submittedRecallQuery ? (
          <EmptyBlock density="compact" title="No recalled matches">
            No saved profile details matched this query.
          </EmptyBlock>
        ) : (
          <Notice>
            Search saved profile memory for the current desktop user.
          </Notice>
        )}
      </section>

      <section className={`${MEMORY_CARD_CLASS} min-h-0`}>
        <div className={MEMORY_HEADING_CLASS}>
          <div>
            <span className="eyebrow">Profile workspace</span>
            <h2>Rolodex summary</h2>
          </div>
          <Badge>{asString(summary.agentName, "Doolittle")}</Badge>
        </div>
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
      </section>

      <section
        className={`${MEMORY_CARD_CLASS} col-span-full max-[760px]:col-auto`}
      >
        <div className={MEMORY_HEADING_CLASS}>
          <div>
            <span className="eyebrow">Agent profile</span>
            <h2>Operator card</h2>
          </div>
          <Button
            className="text-button"
            disabled={!active}
            onClick={agentProfile.reload}
            type="button"
            variant="ghost"
          >
            Refresh card
          </Button>
        </div>
        {agentProfile.loading ? (
          <LoadingBlock label="Loading agent profile…" />
        ) : agentProfile.error ? (
          <ErrorBlock error={agentProfile.error} retry={agentProfile.reload} />
        ) : agentCard ? (
          <pre className={MEMORY_PREVIEW_CLASS}>{agentCard}</pre>
        ) : (
          <EmptyBlock density="compact" title="No agent card">
            The runtime did not return an agent profile card.
          </EmptyBlock>
        )}
      </section>
    </div>
  );
}
