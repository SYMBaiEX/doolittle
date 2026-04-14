import type { UserProfileWorkspaceSummary } from "@/types";
import type { ProfileRenderReader } from "../render/reader";
import {
  render as renderUserProfile,
  renderAgent as renderUserProfileAgent,
  renderCards as renderUserProfileCards,
  summary as summarizeUserProfiles,
} from "../rendering";

export function renderUserProfileCard(
  reader: ProfileRenderReader,
  userId: string,
): string {
  return renderUserProfileCards(reader, userId);
}

export function renderAgentProfile(reader: ProfileRenderReader): string {
  return renderUserProfileAgent(reader);
}

export function renderUserProfileDetail(
  reader: ProfileRenderReader,
  userId: string,
): string {
  return renderUserProfile(reader, userId);
}

export function summarizeUserProfileWorkspace(
  reader: ProfileRenderReader,
): UserProfileWorkspaceSummary {
  return summarizeUserProfiles(reader);
}
