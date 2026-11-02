import { join } from "node:path";
import { NodeSessionDatabase } from "../database";
import { ProjectStore } from "./store";

/** Fresh client metadata from the runtime's store; no migrations, cache or writes. */
export function readStoredProject(dataDir: string, projectId: string) {
  const database = new NodeSessionDatabase(join(dataDir, "state.db"), {
    readOnly: true,
    timeout: 1_000,
  });
  try {
    return new ProjectStore(database).get(projectId);
  } finally {
    database.close();
  }
}
