import type { AgentExecutionContext } from "@/runtime/chat";

const SKILL_SYNTHESIS_NUDGE_INTERVAL = 12;

export function getContextUsageWarning(
  context: AgentExecutionContext,
  sessionId: string,
): string | undefined {
  try {
    const compression = context.services.contextCompression;
    if (!compression) return undefined;
    const sessionMsgs = context.services.sessions.recentBySession(
      sessionId,
      200,
    );
    if (sessionMsgs.length < 4) return undefined;
    if (
      compression.isApproachingLimit(
        sessionMsgs as Parameters<typeof compression.isApproachingLimit>[0],
        0.75,
      )
    ) {
      const stats = compression.measure(
        sessionMsgs as Parameters<typeof compression.measure>[0],
      );
      const pct = Math.round(stats.usageFraction * 100);
      if (pct >= 85) {
        return `\n\n⚠️ Context window at ${pct}% capacity (~${stats.estimatedTokens.toLocaleString()} tokens). Earlier turns may be summarized soon to preserve context.`;
      }
      if (pct >= 75) {
        return `\n\n💡 Context window at ${pct}% — consider starting a new session for unrelated tasks.`;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export function maybeGetSkillSynthesisNudge(
  context: AgentExecutionContext,
  sessionId: string,
  turnCount: number,
): string | undefined {
  try {
    if (turnCount % SKILL_SYNTHESIS_NUDGE_INTERVAL !== 0) return undefined;

    const sessionMsgs = context.services.sessions.recentBySession(
      sessionId,
      100,
    );
    if (sessionMsgs.length < 6) return undefined;

    const analysis = context.services.skillSynthesis.analyzeConversation(
      sessionMsgs as Parameters<
        typeof context.services.skillSynthesis.analyzeConversation
      >[0],
    );

    if (!analysis.shouldSynthesize || !analysis.candidate) return undefined;

    return (
      `\n\n💡 **Skill synthesis available**: This conversation contains a reusable workflow — ` +
      `"${analysis.candidate.title}". ` +
      `Run \`/skills synthesize latest\` to save it as a skill document, or I can do it automatically.`
    );
  } catch {
    return undefined;
  }
}
