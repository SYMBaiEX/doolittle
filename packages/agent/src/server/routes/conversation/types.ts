export interface ConversationResponseRecord {
  id: string;
  createdAt: number | string;
  previousResponseId?: string;
  outputText: string;
  roomId: string;
}

export interface ChatRequestBody {
  message?: string;
  userId?: string;
  roomId?: string;
  projectId?: string;
  workspaceDir?: string;
  runId?: string;
  source?: string;
  stream?: boolean;
  attachmentIds?: string[];
  /** Display name of the automation this run executes, when any. */
  automationName?: string;
}

export interface ResponsesRequestBody {
  input?: unknown;
  previous_response_id?: string;
  stream?: boolean;
  user?: string;
  metadata?: Record<string, string>;
}
