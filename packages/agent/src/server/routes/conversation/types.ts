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
  runId?: string;
  source?: string;
  stream?: boolean;
  attachmentIds?: string[];
}

export interface ResponsesRequestBody {
  input?: string | Array<{ role?: string; content?: string }>;
  previous_response_id?: string;
  stream?: boolean;
  user?: string;
  metadata?: Record<string, string>;
}
