import { deflateSync } from "node:zlib";

interface CaptureCardPageSnapshot {
  url: string;
  title?: string;
  metaDescription?: string;
  text: string;
  provider: "lightpanda" | "basic";
  mode: "browser" | "fallback";
  contentType: string;
  wordCount: number;
  linkCount: number;
  imageCount: number;
  contentHash: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function createScreenshotSvg(
  page: CaptureCardPageSnapshot,
  notes: string[],
): string {
  const title = page.title ?? page.url;
  const excerpt = (page.text || page.metaDescription || "")
    .replace(/\s+/gu, " ")
    .slice(0, 240);
  const lines = [
    `Page: ${title}`,
    `URL: ${page.url}`,
    `Provider: ${page.provider} / ${page.mode}`,
    `Content: ${page.contentType} | ${page.wordCount} words | ${page.linkCount} links | ${page.imageCount} images`,
    ...(page.metaDescription ? [`Description: ${page.metaDescription}`] : []),
    ...(excerpt ? [`Excerpt: ${excerpt}`] : []),
    ...(notes.length ? [`Notes: ${notes[0]}`] : []),
  ];

  const rows = lines
    .map(
      (line, index) =>
        `<text x="24" y="${60 + index * 30}" fill="#f5f7fb" font-family="ui-monospace, SFMono-Regular, monospace" font-size="18">${escapeXml(line)}</text>`,
    )
    .join("");
  const height = Math.max(260, 120 + lines.length * 30);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">
  <rect width="1200" height="${height}" fill="#0f172a"/>
  <rect x="20" y="20" width="1160" height="${Math.max(220, 80 + lines.length * 30)}" rx="18" fill="#111827" stroke="#334155" stroke-width="2"/>
  <text x="24" y="42" fill="#93c5fd" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" font-weight="700">Doolittle Browser Capture</text>
  ${rows}
</svg>`;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const value of input) {
    crc = CRC_TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const chunkType = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([chunkType, data])), 0);
  return Buffer.concat([length, chunkType, data, crc]);
}

function colorFromHash(seed: string, offset: number): [number, number, number] {
  const source = seed || "doolittle-browser-capture";
  const pick = (index: number) =>
    source.charCodeAt((index + offset) % source.length) || 64;
  return [
    (pick(0) + offset * 13) % 256,
    (pick(1) + offset * 29) % 256,
    (pick(2) + offset * 47) % 256,
  ];
}

export function createPixelScreenshotPng(
  page: CaptureCardPageSnapshot,
): Buffer {
  const width = 640;
  const height = 360;
  const headerHeight = 56;
  const stripeStart = 112;
  const stripeHeight = 18;
  const bodyStart = 160;
  const background = colorFromHash(page.contentHash, 1);
  const accent = colorFromHash(page.contentHash, 3);
  const highlight = colorFromHash(page.contentHash, 5);
  const rows: Buffer[] = [];

  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(width * 4 + 1);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      let [red, green, blue] = background;

      if (y < headerHeight) {
        red = Math.min(255, accent[0] + 18);
        green = Math.min(255, accent[1] + 12);
        blue = Math.min(255, accent[2] + 10);
      } else if (y >= stripeStart && y < stripeStart + stripeHeight) {
        [red, green, blue] = highlight;
      } else if (y >= bodyStart) {
        const gradient = Math.floor(
          (255 * (y - bodyStart)) / (height - bodyStart || 1),
        );
        red = Math.min(255, background[0] + Math.floor(gradient / 9));
        green = Math.min(255, background[1] + Math.floor(gradient / 12));
        blue = Math.min(255, background[2] + Math.floor(gradient / 16));
      }

      if (x < 16 || x > width - 17 || y < 16 || y > height - 17) {
        red = Math.max(0, red - 24);
        green = Math.max(0, green - 24);
        blue = Math.max(0, blue - 24);
      }

      row[offset] = red;
      row[offset + 1] = green;
      row[offset + 2] = blue;
      row[offset + 3] = 255;
    }
    rows.push(row);
  }

  const imageData = deflateSync(Buffer.concat(rows));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("IDAT", imageData),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
