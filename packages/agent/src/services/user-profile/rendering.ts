import type { UserProfileWorkspaceSummary } from "@/types";
import type { ProfileRenderReader } from "./render/reader";
import {
  renderAgentProfile,
  renderUserProfile,
  renderUserProfileCards,
} from "./render/text";
import { buildWorkspaceSummary } from "./render/workspace";

export type { ProfileRenderReader } from "./render/reader";

export function render(reader: ProfileRenderReader, userId: string): string {
  return renderUserProfile(reader, userId);
}

export function renderAgent(reader: ProfileRenderReader): string {
  return renderAgentProfile(reader);
}

export function renderCards(
  reader: ProfileRenderReader,
  userId: string,
): string {
  return renderUserProfileCards(reader, userId);
}

export function summary(
  reader: ProfileRenderReader,
): UserProfileWorkspaceSummary {
  return buildWorkspaceSummary(reader);
}
