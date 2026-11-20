// Checks the answer
// Rules:
// 1. Upper/lower case does not matter.
// 2. Extra spaces do not matter.
// 3. The apostrophes all count as the same character.
// 4. An answer may list several correct options separated by "/".
// 5. Special letters are strict.

const APOSTROPHES = /[\u2018\u2019\u02BC\u0060\u00B4\u2032]/g;

export function tidy(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

function key(ch: string): string {
  return ch.replace(APOSTROPHES, "'").toLowerCase();
}

export function normalize(text: string): string {
  return Array.from(tidy(text)).map(key).join("");
}

export function alternatives(expected: string): string[] {
  return expected
    .split("/")
    .map(tidy)
    .filter((a) => a.length > 0);
}

export interface CheckResult {
  correct: boolean;
  expected: string;
  marks: boolean[];
}

export function checkAnswer(typed: string, expected: string): CheckResult {
  const options = alternatives(expected);
  if (options.length === 0) {
    return { correct: false, expected: tidy(expected), marks: [] };
  }

  const given = normalize(typed);
  for (const option of options) {
    if (normalize(option) === given) {
      return { correct: true, expected: option, marks: Array.from(option).map(() => false) };
    }
  }

  let best = options[0];
  let bestMarks = diffMarks(typed, best);
  let bestDistance = distance(typed, best);
  for (const option of options.slice(1)) {
    const d = distance(typed, option);
    if (d < bestDistance) {
      best = option;
      bestDistance = d;
      bestMarks = diffMarks(typed, option);
    }
  }
  return { correct: false, expected: best, marks: bestMarks };
}

function table(a: string[], b: string[]): number[][] {
  const datapush: number[][] = [];
  for (let index = 0; index <= a.length; index++) {
    datapush.push(new Array<number>(b.length + 1).fill(0));
    datapush[index][0] = index;
  }
  for (let check = 0; check <= b.length; check++) datapush[0][check] = check;
  for (let index = 1; index <= a.length; index++) {
    for (let check = 1; check <= b.length; check++) {
      const same = key(a[index - 1]) === key(b[check - 1]) ? 0 : 1;
      datapush[index][check] = Math.min(datapush[index - 1][check] + 1, datapush[index][check - 1] + 1, datapush[index - 1][check - 1] + same);
    }
  }
  return datapush;
}

function distance(typed: string, option: string): number {
  const a = Array.from(tidy(typed));
  const b = Array.from(option);
  return table(a, b)[a.length][b.length];
}

export function diffMarks(typed: string, option: string): boolean[] {
  const a = Array.from(tidy(typed));
  const b = Array.from(option);
  const marks = b.map(() => false);
  if (a.length === 0) return b.map(() => true);

  const dp = table(a, b);
  let index = a.length;
  let check = b.length;
  while (index > 0 || check > 0) {
    if (index > 0 && check > 0) {
      const same = key(a[index - 1]) === key(b[check - 1]) ? 0 : 1;
      if (dp[index][check] === dp[index - 1][check - 1] + same) {
        if (same) marks[check - 1] = true; // wrong letter
        index--;
        check--;
        continue;
      }
    }
    if (check > 0 && dp[index][check] === dp[index][check - 1] + 1) {
      marks[check - 1] = true;
      check--;
      continue;
    }
    const near = Math.min(Math.max(check, 0), b.length - 1);
    if (near >= 0) marks[near] = true;
    index--;
  }
  return marks;
}
