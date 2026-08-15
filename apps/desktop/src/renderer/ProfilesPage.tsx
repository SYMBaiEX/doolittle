import { useState } from "react";
import { CompactCatalogList } from "./components/CompactCatalogList";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  EmptyBlock,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  PageHeader,
  titleCase,
  useApiResource,
} from "./lib";

interface PersonalityResponse {
  active?: unknown;
  available?: unknown[];
  summary?: unknown;
}

export interface PersonalityProfile {
  readonly description: string;
  readonly id: string;
  readonly name: string;
}

function normalizeProfile(profile: Record<string, unknown>, index = 0) {
  const id = asString(profile.id, index < 0 ? "default" : `profile-${index}`);
  return {
    id,
    name: asString(profile.name, titleCase(id)),
    description: asString(
      profile.description,
      asString(profile.summary, "A local Doolittle personality profile."),
    ),
  } satisfies PersonalityProfile;
}

export function normalizePersonalityProfiles(
  response: PersonalityResponse | null | undefined,
): {
  active: PersonalityProfile;
  alternatives: PersonalityProfile[];
} {
  const active = normalizeProfile(asRecord(response?.active), -1);
  return {
    active,
    alternatives: asArray(response?.available)
      .map((profile, index) => normalizeProfile(asRecord(profile), index))
      .filter((profile) => profile.id !== active.id),
  };
}

export function ProfilesPage({ active }: { active: boolean }) {
  const resource = useApiResource<PersonalityResponse>(
    active ? "/personality" : null,
    [active],
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const profiles = asArray(resource.data?.available);
  const presentation = normalizePersonalityProfiles(resource.data);
  const activeProfileId = presentation.active.id;

  const activate = async (id: string) => {
    setBusy(id);
    setError("");
    try {
      await desktopRequest("/personality", "POST", { id });
      resource.reload();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  };

  const profileEntries = presentation.alternatives.map((profile) => {
    return {
      id: profile.id,
      title: profile.name,
      description: profile.description,
      code: profile.id,
      action: (
        <button
          className="secondary-button"
          disabled={Boolean(busy)}
          onClick={() => void activate(profile.id)}
          type="button"
        >
          {busy === profile.id ? "Activating…" : "Use profile"}
        </button>
      ),
    };
  });

  return (
    <div className="page page-profiles">
      <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-4">
        <PageHeader
          eyebrow="Identity"
          title="Profiles"
          description="Choose Doolittle’s voice and working style."
        />
        {error ? <Notice tone="bad">{error}</Notice> : null}
        {resource.loading ? (
          <LoadingBlock label="Loading personality profiles…" />
        ) : resource.error ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : profiles.length ? (
          <div className="profile-picker grid items-start gap-4 min-[701px]:grid-cols-[minmax(18rem,0.42fr)_minmax(0,0.58fr)]">
            <section
              aria-label="Active identity"
              className="profile-current grid grid-cols-[38px_minmax(0,1fr)] items-start gap-3 rounded-[var(--radius-sm)] border border-[var(--border)] border-l-2 border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-3 min-[701px]:grid-cols-[42px_minmax(0,1fr)_auto] min-[701px]:items-center min-[701px]:gap-3.5 min-[701px]:px-4 min-[701px]:py-3.5 [&>.badge]:col-start-2 [&>.badge]:justify-self-start min-[701px]:[&>.badge]:col-start-auto"
            >
              <div
                className="profile-current__mark grid size-[38px] place-items-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--accent)_44%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_11%,var(--surface-soft))] font-[var(--font-mono)] text-[var(--text-meta)] font-bold text-[var(--accent)]"
                aria-hidden="true"
              >
                {presentation.active.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="profile-current__copy grid min-w-0 gap-0.5">
                <span className="eyebrow">Active identity</span>
                <strong className="text-[var(--text-section)]">
                  {presentation.active.name}
                </strong>
                <p className="m-0 text-[var(--text-meta)] leading-[1.4] text-[var(--text-soft)] min-[701px]:truncate">
                  {presentation.active.description}
                </p>
              </div>
              <Badge tone="good">In use</Badge>
            </section>
            {profileEntries.length ? (
              <section className="profile-alternatives grid min-w-0 gap-[7px]">
                <header className="profile-alternatives__header flex items-center justify-between gap-3 px-0.5">
                  <span className="eyebrow">Switch identity</span>
                  <span className="font-[var(--font-mono)] text-[var(--text-meta)] text-[var(--muted)]">
                    {profileEntries.length} available
                  </span>
                </header>
                <CompactCatalogList
                  ariaLabel="Alternative personality profiles"
                  entries={profileEntries}
                  resetKey={activeProfileId}
                />
              </section>
            ) : null}
          </div>
        ) : (
          <EmptyBlock
            title={active ? "No profiles found" : "Profiles are offline"}
            actions={
              <button
                className="secondary-button"
                disabled={!active}
                onClick={resource.reload}
                type="button"
              >
                Refresh profiles
              </button>
            }
          >
            {active
              ? "The runtime did not return any personality profiles. Refresh after adding one to the local workspace."
              : "Restart the local runtime to load Doolittle’s available personalities."}
          </EmptyBlock>
        )}
      </div>
    </div>
  );
}
