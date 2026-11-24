import {
  ArrowRight,
  RefreshCw,
  RotateCw,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import { CompactCatalogList } from "./components/CompactCatalogList";
import {
  WorkbenchAction,
  WorkbenchEmpty,
  WorkbenchSection,
} from "./components/workbench/Workbench";
import { copyContextText } from "./context-menu-clipboard";
import {
  asArray,
  asRecord,
  asString,
  Badge,
  desktopRequest,
  ErrorBlock,
  errorMessage,
  LoadingBlock,
  Notice,
  titleCase,
  useApiResource,
} from "./lib";
import { DiagnosticWorkspace } from "./runtime-state/DiagnosticWorkspace";

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
      contextActions: [
        {
          id: "activate",
          label: "Use profile",
          disabled: Boolean(busy) || !active,
          onSelect: (): void => void activate(profile.id),
        },
        {
          id: "copy-id",
          label: "Copy profile ID",
          onSelect: (): void => void copyContextText(profile.id),
        },
      ],
      action: (
        <WorkbenchAction
          disabled={Boolean(busy) || !active}
          emphasis="quiet"
          icon={ArrowRight}
          onClick={() => void activate(profile.id)}
        >
          {busy === profile.id ? "Activating…" : "Use profile"}
        </WorkbenchAction>
      ),
    };
  });

  return (
    <DiagnosticWorkspace
      actions={
        <WorkbenchAction
          disabled={!active || Boolean(busy)}
          icon={RotateCw}
          onClick={resource.reload}
        >
          Refresh
        </WorkbenchAction>
      }
      description="Choose Doolittle’s voice and working style."
      icon={UserRound}
      title="Profiles"
      titleHidden
    >
      <div className="settings-profile-workbench__content">
        {error ? <Notice tone="bad">{error}</Notice> : null}
        {resource.loading ? (
          <LoadingBlock label="Loading personality profiles…" />
        ) : resource.error ? (
          <ErrorBlock error={resource.error} retry={resource.reload} />
        ) : profiles.length ? (
          <div className="settings-profile-workbench__grid">
            <WorkbenchSection
              actions={<Badge tone="good">In use</Badge>}
              headingLevel={3}
              icon={UserRound}
              title="Active identity"
            >
              <div className="settings-profile-workbench__identity">
                <span aria-hidden="true">
                  {Array.from(presentation.active.name)
                    .slice(0, 2)
                    .join("")
                    .toUpperCase()}
                </span>
                <div>
                  <strong>{presentation.active.name}</strong>
                  <p>{presentation.active.description}</p>
                </div>
              </div>
            </WorkbenchSection>
            {profileEntries.length ? (
              <WorkbenchSection
                actions={<Badge>{profileEntries.length} available</Badge>}
                headingLevel={3}
                icon={UsersRound}
                title="Switch identity"
              >
                <CompactCatalogList
                  ariaLabel="Alternative personality profiles"
                  entries={profileEntries}
                  resetKey={activeProfileId}
                />
              </WorkbenchSection>
            ) : null}
          </div>
        ) : (
          <WorkbenchEmpty
            icon={UsersRound}
            title={active ? "No profiles found" : "Profiles are offline"}
            actions={
              active ? (
                <WorkbenchAction icon={RefreshCw} onClick={resource.reload}>
                  Refresh profiles
                </WorkbenchAction>
              ) : undefined
            }
          >
            {active
              ? "The runtime did not return any personality profiles. Refresh after adding one to the local workspace."
              : "Restart the local runtime to load Doolittle’s available personalities."}
          </WorkbenchEmpty>
        )}
      </div>
    </DiagnosticWorkspace>
  );
}
