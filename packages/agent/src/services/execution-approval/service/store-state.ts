import type { ExecutionApprovalStore } from "../store";
import type {
  ExecutionApprovalRecord,
  ExecutionApprovalStoreData,
} from "../types";
import { expirePendingApprovals, pruneApprovalStore } from "../updates";

export function readActiveApprovalStore(
  store: ExecutionApprovalStore,
): ExecutionApprovalStoreData {
  const storeData = store.read();
  if (expirePendingApprovals(storeData)) {
    pruneApprovalStore(storeData);
    store.write(storeData);
  }
  return storeData;
}

export function getApprovalRecord(
  store: ExecutionApprovalStore,
  id: string,
): ExecutionApprovalRecord | undefined {
  return readActiveApprovalStore(store).approvals.find(
    (record) => record.id === id,
  );
}

export function assertPendingApproval(
  store: ExecutionApprovalStore,
  id: string,
): ExecutionApprovalRecord {
  const record = getApprovalRecord(store, id);
  if (!record) {
    throw new Error(`Approval not found: ${id}`);
  }
  if (record.status !== "pending") {
    throw new Error(`Approval ${id} is ${record.status}.`);
  }
  return record;
}

export function updateApprovalRecord(
  store: ExecutionApprovalStore,
  id: string,
  update: (record: ExecutionApprovalRecord) => void,
): ExecutionApprovalRecord {
  const storeData = store.read();
  if (expirePendingApprovals(storeData)) {
    pruneApprovalStore(storeData);
  }
  const record = storeData.approvals.find((entry) => entry.id === id);
  if (!record) {
    throw new Error(`Approval not found: ${id}`);
  }
  update(record);
  pruneApprovalStore(storeData);
  store.write(storeData);
  return { ...record };
}

export function safeMutateApprovalRecord(
  store: ExecutionApprovalStore,
  id: string,
  update: (record: ExecutionApprovalRecord) => void,
): void {
  try {
    updateApprovalRecord(store, id, update);
  } catch {
    // Ignore late async writes if the mirror record has already been pruned.
  }
}
