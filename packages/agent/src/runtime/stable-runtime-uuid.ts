import { createHash } from "node:crypto";
import type { UUID } from "@elizaos/core";

export function stableRuntimeUuid(seed: string): UUID {
  const hash = createHash("sha256").update(seed).digest("hex");
  const variantNibble = (
    (Number.parseInt(hash.slice(16, 17), 16) & 0x3) |
    0x8
  ).toString(16);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `${variantNibble}${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-") as UUID;
}
