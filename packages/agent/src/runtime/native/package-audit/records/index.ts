import type { NativePackageAuditRecord } from "../types";
import { NATIVE_AUTOMATION_PACKAGE_AUDIT_RECORDS } from "./automation";
import { NATIVE_EXECUTION_PACKAGE_AUDIT_RECORDS } from "./execution";
import { NATIVE_FOUNDATION_PACKAGE_AUDIT_RECORDS } from "./foundation";
import { NATIVE_INTERACTION_PACKAGE_AUDIT_RECORDS } from "./interaction";

const NATIVE_PACKAGE_AUDIT_RECORDS: NativePackageAuditRecord[] = [
  ...NATIVE_FOUNDATION_PACKAGE_AUDIT_RECORDS,
  ...NATIVE_INTERACTION_PACKAGE_AUDIT_RECORDS,
  ...NATIVE_EXECUTION_PACKAGE_AUDIT_RECORDS,
  ...NATIVE_AUTOMATION_PACKAGE_AUDIT_RECORDS,
];

export function getNativePackageAuditRecords(): NativePackageAuditRecord[] {
  return [...NATIVE_PACKAGE_AUDIT_RECORDS];
}
