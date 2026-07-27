export type ReviewRecordCommentStatus = "open" | "resolved";
export type ReviewRecordEventType =
  | "comment_created"
  | "comment_edited"
  | "comment_resolved"
  | "comment_reopened"
  | "comment_deleted"
  | "feedback_sent";

export interface ReviewRecordAnchor {
  side: "old" | "new";
  line: number;
  preview: string;
}

export interface ReviewRecordComment {
  id: string;
  path: string;
  anchor?: ReviewRecordAnchor;
  body: string;
  status: ReviewRecordCommentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewRecordEvent {
  id: string;
  type: ReviewRecordEventType;
  commentId?: string;
  detail: string;
  createdAt: string;
}

export interface ReviewRecordScope {
  repositoryRoot: string;
  branch: string;
  head: string;
}

export interface ReviewRecord {
  scope: ReviewRecordScope;
  comments: ReviewRecordComment[];
  events: ReviewRecordEvent[];
  updatedAt: string;
}

export interface ReviewRecordPage {
  record: ReviewRecord;
  entries: Array<ReviewRecordComment | ReviewRecordEvent>;
  nextCursor?: string;
}
