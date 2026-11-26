export interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  line: string;
  oldLineNo?: number;
  newLineNo?: number;
}

export function computeLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const a = beforeText.replace(/\r\n/g, '\n').split('\n');
  const b = afterText.replace(/\r\n/g, '\n').split('\n');
  const m = a.length;
  const n = b.length;

  // Guard for very large files: fallback gracefully
  if (m * n > 250000) {
    return [
      ...a.map((line, i) => ({ type: 'remove' as const, line, oldLineNo: i + 1 })),
      ...b.map((line, i) => ({ type: 'add' as const, line, newLineNo: i + 1 })),
    ];
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0)
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      result.push({
        type: 'equal',
        line: a[i],
        oldLineNo: i + 1,
        newLineNo: j + 1,
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'remove', line: a[i], oldLineNo: i + 1 });
      i++;
    } else {
      result.push({ type: 'add', line: b[j], newLineNo: j + 1 });
      j++;
    }
  }

  while (i < m) {
    result.push({ type: 'remove', line: a[i], oldLineNo: i + 1 });
    i++;
  }
  while (j < n) {
    result.push({ type: 'add', line: b[j], newLineNo: j + 1 });
    j++;
  }

  return result;
}
