export function escapeBlessed(text: string): string {
  return text.replaceAll("{", "\\{").replaceAll("}", "\\}");
}
