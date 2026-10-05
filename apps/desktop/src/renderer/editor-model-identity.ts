/** Monaco's TS worker detects script kind from the final URI suffix, including query. */
export function editorModelQuery(
  path: string,
  instanceId: string,
  botId?: string,
  conversationId?: string,
): string {
  const extension = /\.(tsx?|jsx?)$/iu.exec(path)?.[1]?.toLowerCase();
  const identity = encodeURIComponent(
    JSON.stringify([botId ?? null, conversationId ?? null, instanceId]),
  );
  return `doolittle=${identity}${extension ? `&script=.${extension}` : ""}`;
}
