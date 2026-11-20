export const BOX_INTERVAL_DAYS = [1, 2, 4, 7, 14] as const;
export const BOX_COUNT = BOX_INTERVAL_DAYS.length;

export function nextBox(box: number, correct: boolean): number {
  return correct ? Math.min(box + 1, BOX_COUNT) : 1;
}

export function intervalDays(box: number): number {
  return BOX_INTERVAL_DAYS[Math.min(Math.max(box, 1), BOX_COUNT) - 1];
}
