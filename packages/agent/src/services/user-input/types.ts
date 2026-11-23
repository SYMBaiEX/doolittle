export interface UserInputOption {
  label: string;
  description?: string;
}

export interface UserInputQuestion {
  question: string;
  header?: string;
  options: UserInputOption[];
  multiSelect: boolean;
}

export interface UserInputAnswer {
  question: string;
  selected: string[];
  customText?: string;
}

export type UserInputRequestStatus =
  | "pending"
  | "answered"
  | "dismissed"
  | "superseded";

export interface UserInputRequest {
  id: string;
  roomId: string;
  userId?: string;
  sessionId?: string;
  runId?: string;
  botId?: string;
  source?: string;
  /** The originating turn required a verified workspace mutation. */
  mutationObligation?: boolean;
  questions: UserInputQuestion[];
  status: UserInputRequestStatus;
  createdAt: string;
  resolvedAt?: string;
  answers?: UserInputAnswer[];
}

export interface UserInputRequestStoreData {
  requests: UserInputRequest[];
}

export interface CreateUserInputRequestInput {
  roomId: string;
  userId?: string;
  sessionId?: string;
  runId?: string;
  botId?: string;
  source?: string;
  mutationObligation?: boolean;
  questions: UserInputQuestion[];
}
