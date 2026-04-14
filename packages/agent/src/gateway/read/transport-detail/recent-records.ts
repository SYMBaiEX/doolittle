import type { PlatformName } from "@/types/gateway";
import type { TransportRecordBucket } from "./types";

export function getPlatformRecords<
  T extends { platform: PlatformName | "gateway" },
>(
  records: readonly T[],
  platform: PlatformName,
  recentLimit: number,
): TransportRecordBucket<T> {
  const all = records.filter(
    (record): record is T => record.platform === platform,
  );
  return {
    all,
    recent: all.slice(-recentLimit).reverse(),
  };
}
