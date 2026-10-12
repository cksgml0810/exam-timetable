/* 과목 간 충돌(공통 수강생) 계산
 * 두 과목을 같은 교시에 시험 보려면 두 과목을 함께 듣는 학생이 0명이어야 한다.
 */
(function (root) {
  const TT = (root.TT = root.TT || {});
  const cache = new WeakMap(); // idx → Map('a|b' → 공통 학생 수)

  /** 두 과목의 공통 수강생 수 */
  TT.overlap = (idx, a, b) => {
    if (a === b) return idx.subjectByName.get(a)?.count || 0;
    let m = cache.get(idx);
    if (!m) cache.set(idx, (m = new Map()));
    const key = a < b ? a + '|' + b : b + '|' + a;
    if (m.has(key)) return m.get(key);
    const A = idx.subjectByName.get(a)?.members;
    const B = idx.subjectByName.get(b)?.members;
    let n = 0;
    if (A && B) {
      const [small, big] = A.size < B.size ? [A, B] : [B, A];
      for (const id of small) if (big.has(id)) n++;
    }
    m.set(key, n);
    return n;
  };

  /** subject를 slotSubjects가 있는 칸에 넣을 때 충돌하는 과목 목록 */
  TT.placeConflicts = (idx, subject, slotSubjects) =>
    slotSubjects
      .filter((s) => s !== subject)
      .map((s) => ({ subject: s, count: TT.overlap(idx, subject, s) }))
      .filter((c) => c.count > 0);

  /** 동시에 시험 볼 수 있는 최대 조합(2과목 이상) — Bron–Kerbosch */
  TT.compatibleGroups = (idx, names) => {
    const ok = (a, b) => TT.overlap(idx, a, b) === 0;
    const out = [];
    const bk = (R, P, X) => {
      if (!P.length && !X.length) {
        if (R.length >= 2) out.push(R);
        return;
      }
      const pivot = [...P, ...X][0];
      for (const v of P.filter((u) => !ok(u, pivot) || u === pivot)) {
        bk([...R, v], P.filter((u) => u !== v && ok(u, v)), X.filter((u) => ok(u, v)));
        P = P.filter((u) => u !== v);
        X = [...X, v];
      }
    };
    bk([], names.slice(), []);
    const size = (g) => g.reduce((t, s) => t + (idx.subjectByName.get(s)?.count || 0), 0);
    return out.sort((a, b) => b.length - a.length || size(b) - size(a));
  };
})(typeof window !== 'undefined' ? window : globalThis);
