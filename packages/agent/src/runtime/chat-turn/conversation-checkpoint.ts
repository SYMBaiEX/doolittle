import type { UUID } from "@elizaos/core";
import type { TranscriptCheckpoint } from "../../services/session/messages/checkpoint";
import type { AgentExecutionContext } from "../chat";

interface NativeTranscriptSnapshot {
  count: number;
  prefixCount: number;
  prefixFingerprint: string;
  fingerprint: string;
  throughId: string | null;
  throughAtMs: number | null;
}

export function checkpointForSnapshot(
  snapshot: NativeTranscriptSnapshot,
  agentId: string,
  roomId: string,
): TranscriptCheckpoint | undefined {
  if (!snapshot.throughId || snapshot.throughAtMs === null) return;
  return {
    agentId,
    roomId,
    throughId: snapshot.throughId,
    throughAt: new Date(snapshot.throughAtMs).toISOString(),
    fingerprint: snapshot.fingerprint,
  };
}

/** Compare projected native values in the database, without materializing the
 * transcript or embeddings in JS. The prefix includes messages subsequently
 * hidden by the product role filter, so even a role edit invalidates it. */
export async function nativeTranscriptReader(
  runtime: AgentExecutionContext["runtime"],
  roomId: UUID,
) {
  const { PgliteDatabaseAdapter } = await import("@elizaos/plugin-sql");
  if (!(runtime.adapter instanceof PgliteDatabaseAdapter)) return;
  const client = runtime.adapter.getRawConnection();
  return async (
    anchor?: TranscriptCheckpoint,
  ): Promise<NativeTranscriptSnapshot | undefined> => {
    try {
      const { rows } = await client.query<NativeTranscriptSnapshot>(
        `
        WITH history AS MATERIALIZED (
          SELECT id, date_trunc('milliseconds', created_at) AS at,
            md5(jsonb_build_array(id, date_trunc('milliseconds', created_at), entity_id,
              content->>'text', content->'actions', metadata->'doolittle'->'role',
              metadata->'doolittle'->'projectionOriginMessageId')::text) AS digest
          FROM public.memories
          WHERE agent_id = $1::uuid AND room_id = $2::uuid AND type = 'messages'
        ), newest AS (
          SELECT id, at FROM history ORDER BY at DESC, id DESC LIMIT 1
        ), compared AS (
          SELECT id, digest,
            (at, id) <= (timestamp 'epoch' + $3::bigint * interval '1 millisecond', $4::uuid) AS in_prefix
          FROM history
        )
        SELECT count(*)::int AS count,
          count(*) FILTER (WHERE in_prefix)::int AS "prefixCount",
          md5(coalesce(string_agg(digest, '' ORDER BY id) FILTER (WHERE in_prefix), '')) AS "prefixFingerprint",
          md5(coalesce(string_agg(digest, '' ORDER BY id), '')) AS fingerprint,
          (SELECT id::text FROM newest) AS "throughId",
          (SELECT (EXTRACT(EPOCH FROM at) * 1000)::float8 FROM newest) AS "throughAtMs"
        FROM compared
      `,
        [
          runtime.agentId,
          roomId,
          anchor ? Date.parse(anchor.throughAt) : null,
          anchor?.throughId ?? null,
        ],
      );
      return rows[0];
    } catch {
      // Adapter/schema differences keep the canonical SDK scan available.
      return undefined;
    }
  };
}
