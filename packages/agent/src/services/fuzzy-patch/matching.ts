/**
 * Edit-distance and fuzzy line matching primitives for fuzzy patching.
 */

/**
 * Computes the Levenshtein edit distance between two strings.
 * O(m*n) time, O(min(m,n)) space.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Work on the shorter string as the inner dimension.
  const [s, t] = a.length <= b.length ? [a, b] : [b, a];

  let prev = Array.from({ length: s.length + 1 }, (_, i) => i);
  for (let j = 1; j <= t.length; j++) {
    const curr = [j];
    for (let i = 1; i <= s.length; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
    }
    prev = curr;
  }
  return prev[s.length];
}

/**
 * Normalises a line for fuzzy comparison: trims trailing whitespace and
 * collapses internal runs of whitespace.
 */
export function normaliseLine(line: string): string {
  return line.trimEnd().replace(/\s+/g, " ");
}

/**
 * Returns true when `a` and `b` are within `maxDist` edit-distance of each
 * other after normalisation.
 */
export function fuzzyMatch(a: string, b: string, maxDist: number): boolean {
  const na = normaliseLine(a);
  const nb = normaliseLine(b);
  if (na === nb) return true;
  if (Math.abs(na.length - nb.length) > maxDist * 2) return false;
  return editDistance(na, nb) <= maxDist;
}
