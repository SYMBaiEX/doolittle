import type { ExecutionApprovalStore } from "../store";
import type {
  ExecutionApprovalMatchInput,
  ExecutionApprovalRecord,
} from "../types";
import { markApprovalUsed, matchesApprovalRequest } from "../updates";
import { readActiveApprovalStore } from "./store-state";

export function listExecutionApprovals(
  store: ExecutionApprovalStore,
  status?: ExecutionApprovalRecord["status"],
): ExecutionApprovalRecord[] {
  return readActiveApprovalStore(store)
    .approvals.filter((record) => (status ? record.status === status : true))
    .slice()
    .reverse();
}

export function getExecutionApproval(
  store: ExecutionApprovalStore,
  id: string,
): ExecutionApprovalRecord | undefined {
  return readActiveApprovalStore(store).approvals.find(
    (record) => record.id === id,
  );
}

export function latestPendingExecutionApprovalForSession(
  store: ExecutionApprovalStore,
  sessionKey: string,
): ExecutionApprovalRecord | undefined {
  return readActiveApprovalStore(store)
    .approvals.slice()
    .reverse()
    .find(
      (record) =>
        record.sessionKey === sessionKey && record.status === "pending",
    );
}

export function findPendingExecutionApproval(
  store: ExecutionApprovalStore,
  input: ExecutionApprovalMatchInput,
): ExecutionApprovalRecord | undefined {
  return readActiveApprovalStore(store)
    .approvals.slice()
    .reverse()
    .find(
      (record) =>
        record.status === "pending" && matchesApprovalRequest(record, input),
    );
}

export function useApprovedExecutionApproval(
  store: ExecutionApprovalStore,
  input: ExecutionApprovalMatchInput,
): ExecutionApprovalRecord | undefined {
  const storeData = readActiveApprovalStore(store);
  const record = storeData.approvals.find(
    (entry) =>
      entry.status === "approved" && matchesApprovalRequest(entry, input),
  );
  if (!record) {
    return undefined;
  }
  markApprovalUsed(record);
  store.write(storeData);
  return record;
}
