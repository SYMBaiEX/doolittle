export function buildMediaPreview(content: string, extension: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return "";
  }

  if (extension === ".html" || extension === ".htm") {
    const text = trimmed
      .replace(/<script[\s\S]*?<\/script>/giu, " ")
      .replace(/<style[\s\S]*?<\/style>/giu, " ")
      .replace(/<[^>]+>/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    return text.slice(0, 512);
  }

  if (extension === ".csv") {
    const [header, ...rows] = trimmed.split(/\r?\n/u);
    const sample = [header, ...rows.slice(0, 2)].join("\n");
    return sample.slice(0, 512);
  }

  return trimmed.slice(0, 512);
}
