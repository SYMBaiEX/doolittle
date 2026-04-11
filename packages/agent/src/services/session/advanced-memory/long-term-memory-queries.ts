import type { Database } from "bun:sqlite";
import type {
  AdvancedLongTermMemory,
  AdvancedLongTermMemoryCategory,
} from "../service";
import { makeAssignmentBuilder } from "./sql";
import type { LongTermMemoryRow } from "./types";

export function insertLongTermMemory(
  db: Database,
  m: AdvancedLongTermMemory,
): void {
  db.query(
    `
      INSERT INTO long_term_memories (
        id, agent_id, entity_id, category, content, metadata, embedding,
        confidence, source, created_at, updated_at, last_accessed_at, access_count
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `,
  ).run(
    m.id,
    m.agentId,
    m.entityId,
    m.category,
    m.content,
    m.metadata ? JSON.stringify(m.metadata) : null,
    m.embedding ? JSON.stringify(m.embedding) : null,
    m.confidence ?? null,
    m.source ?? null,
    m.createdAt.toISOString(),
    m.updatedAt.toISOString(),
    m.lastAccessedAt?.toISOString() ?? null,
    m.accessCount ?? 0,
  );
}

export function selectLongTermMemories(
  db: Database,
  agentId: string,
  entityId: string,
  category: AdvancedLongTermMemoryCategory | undefined,
  limit: number,
): LongTermMemoryRow[] {
  if (category) {
    return db
      .query(
        `
          SELECT * FROM long_term_memories
          WHERE agent_id = ?1 AND entity_id = ?2 AND category = ?3
          ORDER BY created_at DESC
          LIMIT ?4
        `,
      )
      .all(agentId, entityId, category, limit) as LongTermMemoryRow[];
  }
  return db
    .query(
      `
        SELECT * FROM long_term_memories
        WHERE agent_id = ?1 AND entity_id = ?2
        ORDER BY created_at DESC
        LIMIT ?3
      `,
    )
    .all(agentId, entityId, limit) as LongTermMemoryRow[];
}

export function touchLongTermMemories(
  db: Database,
  ids: string[],
  now: string,
): void {
  const stmt = db.query(
    `
      UPDATE long_term_memories
      SET last_accessed_at = ?1,
          access_count = COALESCE(access_count, 0) + 1
      WHERE id = ?2
    `,
  );
  for (const id of ids) {
    stmt.run(now, id);
  }
}

export function patchLongTermMemory(
  db: Database,
  id: string,
  agentId: string,
  entityId: string,
  updates: Partial<
    Omit<AdvancedLongTermMemory, "id" | "agentId" | "entityId" | "createdAt">
  >,
): void {
  const b = makeAssignmentBuilder();

  if (updates.category !== undefined) b.push("category", updates.category);
  if (updates.content !== undefined) b.push("content", updates.content);
  if (updates.metadata !== undefined)
    b.push("metadata", JSON.stringify(updates.metadata));
  if (updates.embedding !== undefined)
    b.push("embedding", JSON.stringify(updates.embedding));
  if (updates.confidence !== undefined)
    b.push("confidence", updates.confidence ?? null);
  if (updates.source !== undefined) b.push("source", updates.source ?? null);
  if (updates.lastAccessedAt !== undefined)
    b.push(
      "last_accessed_at",
      updates.lastAccessedAt ? updates.lastAccessedAt.toISOString() : null,
    );
  if (updates.accessCount !== undefined)
    b.push("access_count", updates.accessCount ?? 0);

  b.push("updated_at", new Date().toISOString());
  const vals = [...b.values, id, agentId, entityId];
  const n = vals.length;

  db.query(
    `
      UPDATE long_term_memories
      SET ${b.assignments.join(", ")}
      WHERE id = ?${n - 2}
        AND agent_id = ?${n - 1}
        AND entity_id = ?${n}
    `,
  ).run(...vals);
}

export function deleteLongTermMemory(
  db: Database,
  id: string,
  agentId: string,
  entityId: string,
): void {
  db.query(
    `
      DELETE FROM long_term_memories
      WHERE id = ?1 AND agent_id = ?2 AND entity_id = ?3
    `,
  ).run(id, agentId, entityId);
}
