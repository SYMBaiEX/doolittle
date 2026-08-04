import { useState } from "react";
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
import "./agent-pages.css";

interface PersonalityResponse {
  active?: unknown;
  available?: unknown[];
  summary?: unknown;
}

export function ProfilesPage({ active }: { active: boolean }) {
  const resource = useApiResource<PersonalityResponse>(
    active ? "/personality" : null,
    [active],
  );
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const activeProfile = asRecord(resource.data?.active);
  const profiles = asArray(resource.data?.available).map(asRecord);

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

  return (
    <div className="page">
      <PageHeader
        eyebrow="Identity"
        title="Profiles"
        description="Choose the local personality that shapes Doolittle’s voice, priorities, and working style."
        actions={
          <Badge tone="good">
            {asString(
              activeProfile.name,
              titleCase(asString(activeProfile.id, "Default")),
            )}
          </Badge>
        }
      />
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {resource.loading ? (
        <LoadingBlock label="Loading personality profiles…" />
      ) : resource.error ? (
        <ErrorBlock error={resource.error} retry={resource.reload} />
      ) : profiles.length ? (
        <div className="card-grid">
          {profiles.map((profile, index) => {
            const id = asString(profile.id, `profile-${index}`);
            const isActive = id === asString(activeProfile.id);
            return (
              <article className="content-card profile-card" key={id}>
                <div className="profile-avatar" aria-hidden="true">
                  {asString(profile.name, id).slice(0, 1).toUpperCase()}
                </div>
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">
                      {isActive ? "Active identity" : "Available identity"}
                    </span>
                    <h2>{asString(profile.name, titleCase(id))}</h2>
                  </div>
                  {isActive ? <Badge tone="good">Active</Badge> : null}
                </div>
                <p>
                  {asString(
                    profile.description,
                    asString(
                      profile.summary,
                      "A local Doolittle personality profile.",
                    ),
                  )}
                </p>
                <button
                  className={isActive ? "secondary-button" : "primary-button"}
                  disabled={isActive || Boolean(busy)}
                  onClick={() => void activate(id)}
                  type="button"
                >
                  {isActive
                    ? "In use"
                    : busy === id
                      ? "Activating…"
                      : "Use profile"}
                </button>
              </article>
            );
          })}
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
