import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(process.cwd() + "/packages/agent/package.json");
const { AgentRuntime } = await import(
  pathToFileURL(require.resolve("@elizaos/core")).href
);
const { default: sql } = await import(
  pathToFileURL(require.resolve("@elizaos/plugin-sql")).href
);
const agentId = randomUUID(),
  a = randomUUID(),
  b = randomUUID();
const runtime = new AgentRuntime({
  character: {
    id: agentId,
    name: "native-sql-contract",
    settings: {
      PGLITE_DATA_DIR: process.env.PGLITE_DATA_DIR,
      POSTGRES_URL: "",
    },
  },
  plugins: [sql],
  enableAutonomy: false,
});
try {
  await runtime.initialize();
  await runtime.adapter.createEntities([
    { id: a, agentId, names: ["first"] },
    { id: b, agentId, names: ["second"] },
  ]);
  assert.equal(
    await runtime.adapter.createRelationship({
      sourceEntityId: a,
      targetEntityId: b,
      tags: ["first"],
      metadata: { label: "original" },
    }),
    true,
  );
  assert.equal(
    await runtime.adapter.createRelationship({
      sourceEntityId: a,
      targetEntityId: b,
      tags: ["replacement"],
      metadata: { label: "replacement" },
    }),
    false,
  );
  const relationship = await runtime.adapter.getRelationship({
    sourceEntityId: a,
    targetEntityId: b,
  });
  assert.deepEqual(relationship.tags, ["first"]);
  assert.deepEqual(relationship.metadata, { label: "original" });
  console.log("SDK_NATIVE_SQL_OK");
} finally {
  await runtime.stop();
}
