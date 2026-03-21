export function stableHashVector(text: string, dimensions = 16): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let index = 0; index < text.length; index += 1) {
    const slot = index % dimensions;
    vector[slot] = (vector[slot] + text.charCodeAt(index) * (index + 1)) % 9973;
  }
  return vector.map((value) => Number((value / 9973).toFixed(6)));
}
