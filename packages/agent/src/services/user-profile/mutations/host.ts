import { nowIso, unique } from "../shared";
import { normalizeRelationship } from "../storage";
import type { UserProfileMutationHost } from "../types";

export const defaultMutationHost: UserProfileMutationHost = {
  nowIso,
  unique,
  normalizeRelationship,
};
