export interface ChatTurnRequest {
  message: string;
  userId: string;
  roomId?: string;
  source?: string;
}
