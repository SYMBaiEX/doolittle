import type { DelegationTaskRecord } from "@/types";

export function visitDelegationDescendants(
  parentTaskId: string,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  visit: (child: DelegationTaskRecord, parentTaskId: string) => void,
): void {
  for (const child of listChildren(parentTaskId)) {
    visit(child, parentTaskId);
    visitDelegationDescendants(child.id, listChildren, visit);
  }
}
