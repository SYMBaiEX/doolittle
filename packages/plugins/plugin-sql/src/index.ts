import { patchDatabaseAdapter } from "./database-adapter";
import {
  mergeRelationshipMetadata,
  normalizeRelationshipMetadata,
  normalizeRelationshipTags,
} from "./metadata-normalization";
import plugin from "./plugin-assembly";

export const __testing = {
  patchDatabaseAdapter,
  normalizeRelationshipTags,
  normalizeRelationshipMetadata,
  mergeRelationshipMetadata,
};

export default plugin;
