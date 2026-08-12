import { useState } from "react";
import { CompactCatalogList } from "./components/CompactCatalogList";
import "./profiles.css";
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
      <PageHeader
        eyebrow="Identity"
        title="Profiles"
        description="Choose the local personality that shapes Doolittle’s voice, priorities, and working style."
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {resource.loading ? (
        <LoadingBlock label="Loading personality profiles…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : profiles.length ? (
        <div className="profile-picker">
          <section aria-label="Active identity" className="profile-current">
            <div className="profile-current__mark" aria-hidden="true">
              {presentation.active.name.slice(0, 2).toUpperCase()}
            </div>
            <div className="profile-current__copy">
              <span className="eyebrow">Active identity</span>
              <strong>{presentation.active.name}</strong>
              <p>{presentation.active.description}</p>
            </div>
            <Badge tone="good">In use</Badge>
          </section>
          {profileEntries.length ? (
            <section className="profile-alternatives">
              <header className="profile-alternatives__header">
                <span className="eyebrow">Switch identity</span>
                <span>{profileEntries.length} available</span>
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
  );
}
