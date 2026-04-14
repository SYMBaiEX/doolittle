import type { UserProfileStorage } from "../storage";
import type {
  UserProfileMutationActions,
  UserProfileMutationHost,
} from "../types";
import { createSeedAgentMutation } from "./agent";
import { createConcludeMutation } from "./conclusion";
import { defaultMutationHost } from "./host";
import {
  createConfigureModelingMutation,
  createSetModeMutation,
} from "./modeling";
import { createAddNoteMutation } from "./note";
import {
  createObserveAgentMutation,
  createObserveMutation,
} from "./observation";
import { createRememberMutation } from "./remember";

export { createSeedAgentMutation } from "./agent";
export { createConcludeMutation } from "./conclusion";
export { defaultMutationHost } from "./host";
export {
  createConfigureModelingMutation,
  createSetModeMutation,
} from "./modeling";
export { createAddNoteMutation } from "./note";
export {
  createObserveAgentMutation,
  createObserveMutation,
} from "./observation";
export { appendRelationshipNote } from "./relationship";
export { createRememberMutation } from "./remember";

export function createUserProfileMutations(
  storage: UserProfileStorage,
  host: UserProfileMutationHost = defaultMutationHost,
): UserProfileMutationActions {
  const remember = createRememberMutation(storage, host);

  return {
    seedAgent: createSeedAgentMutation(storage, host),
    setMode: createSetModeMutation(storage),
    configureModeling: createConfigureModelingMutation(storage),
    addNote: createAddNoteMutation(remember),
    remember,
    observe: createObserveMutation(storage, host),
    observeAgent: createObserveAgentMutation(storage, host),
    conclude: createConcludeMutation(storage, host),
  };
}
