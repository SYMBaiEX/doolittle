export function readJpegDimensions(
  bytes: Buffer,
): { width: number; height: number } | undefined {
  if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) {
    return undefined;
  }

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 3 >= bytes.length) {
      break;
    }

    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) {
      break;
    }

    const sofMarkers = new Set([
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb,
    ]);
    if (sofMarkers.has(marker) && offset + 9 < bytes.length) {
      return {
        height: bytes.readUInt16BE(offset + 5),
        width: bytes.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + length;
  }

  return undefined;
}
