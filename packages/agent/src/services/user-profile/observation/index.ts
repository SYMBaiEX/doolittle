import { applyAgentObservationSignals } from "./apply/agent";
import { applyUserObservationSignals } from "./apply/user";
import { parseAgentObservation } from "./parsing/agent";
import { parseUserObservation } from "./parsing/user";
import type {
  ParsedAgentObservation,
  ParsedUserObservation,
  UserProfileObservationHost,
} from "./types";

export type {
  ParsedAgentObservation,
  ParsedUserObservation,
  UserProfileObservationHost,
};
export {
  applyAgentObservationSignals,
  applyUserObservationSignals,
  parseAgentObservation,
  parseUserObservation,
};

export const extractUserObservationSignals = parseUserObservation;
export const extractAgentObservationSignals = parseAgentObservation;
