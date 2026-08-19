export function parseGrades(targetGrades: string): number[] {
  if (!targetGrades) return [];
  if (targetGrades.includes("-")) {
    const [lo, hi] = targetGrades.split("-").map((s) => Number(s.trim()));
    if (!isNaN(lo) && !isNaN(hi)) return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }
  const single = Number(targetGrades.trim());
  return !isNaN(single) ? [single] : [];
}