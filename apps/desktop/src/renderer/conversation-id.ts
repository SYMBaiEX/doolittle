export function newConversationId(): string {
  return `desktop:${crypto.randomUUID()}`;
}
