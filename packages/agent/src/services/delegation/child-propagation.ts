import type { DelegationTaskRecord } from "@/types";

import { visitDelegationDescendants } from "./descendants";

export function propagateDelegationChildNotes(
  parentId: string,
  note: string,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  addNote: (id: string, note: string) => DelegationTaskRecord,
): void {
  for (const child of listChildren(parentId)) {
    addNote(child.id, note);
  }
}

export function cascadeDelegationDescendants(
  rootId: string,
  listChildren: (parentTaskId: string) => DelegationTaskRecord[],
  visit: (child: DelegationTaskRecord, parentTaskId: string) => void,
): void {
  visitDelegationDescendants(rootId, listChildren, visit);
}
