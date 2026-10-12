/* 시간표 통계
 * - 일자별: 학생 한 명이 그날 보는 과목 수 분포(0·1·2·3…), 최대 과목 수, 시험 없는 학생
 * - 교시(칸)별: 응시 인원, 대기 인원, 분반 수, 같은 칸 안의 충돌
 * - 전체 요약: 하루 최대 과목 수, 과부하 학생, 시험 없는 날이 있는 학생, 미편성 평가과목
 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  /** 사용하는 (일자, 교시) 칸 목록 — 화면 순서 */
  TT.slots = (state) => {
    const out = [];
    for (const d of state.days)
      for (const p of state.periods) {
        const key = TT.slotKey(d.id, p.id);
        if (!state.off[key]) out.push({ key, dayId: d.id, periodId: p.id });
      }
    return out;
  };

  TT.evalSubjectNames = (state, idx) =>
    idx.subjects.filter((s) => state.evalSubjects[s.name]).map((s) => s.name);

  /** 칸에 배치된 과목 (평가과목에서 빠졌거나 데이터에 없는 과목은 무시) */
  TT.slotSubjects = (state, idx, key) =>
    (state.schedule[key] || []).filter((s) => state.evalSubjects[s] && idx.subjectByName.has(s));

  TT.scheduleStats = (state, idx, opts = {}) => {
    const heavyAt = opts.heavyAt || 3;
    const n = idx.active.length;
    const slotStats = {};
    const placed = new Set();

    const days = state.days.map((d, di) => {
      const perStudent = new Map(idx.active.map((s) => [s.id, []]));
      const subjects = [];
      for (const p of state.periods) {
        const key = TT.slotKey(d.id, p.id);
        if (state.off[key]) continue;
        const subs = TT.slotSubjects(state, idx, key);
        const takers = new Set();
        let sections = 0;
        const clashes = [];
        for (const name of subs) {
          const subj = idx.subjectByName.get(name);
          placed.add(name);
          subjects.push(name);
          sections += subj.sections.filter((x) => x.activeMembers.length).length;
          for (const id of subj.members) {
            if (takers.has(id)) clashes.push(id);
            takers.add(id);
            perStudent.get(id).push(name);
          }
        }
        slotStats[key] = { subjects: subs, takers: takers.size, waiting: subs.length ? n - takers.size : 0, sections, clashes };
      }
      const dist = [];
      let max = 0;
      const zero = [];
      for (const [id, list] of perStudent) {
        const c = list.length;
        dist[c] = (dist[c] || 0) + 1;
        if (c > max) max = c;
        if (c === 0) zero.push(id);
      }
      for (let i = 0; i < dist.length; i++) dist[i] = dist[i] || 0;
      return { dayId: d.id, index: di, subjects, dist, max, zero, perStudent, hasExam: subjects.length > 0 };
    });

    // 학생별 전체 요약
    const examDays = days.filter((d) => d.hasExam);
    const heavy = new Set();
    const noExamDay = new Set();
    let maxPerDay = 0;
    for (const d of examDays) {
      maxPerDay = Math.max(maxPerDay, d.max);
      for (const [id, list] of d.perStudent) {
        if (list.length >= heavyAt) heavy.add(id);
        if (list.length === 0) noExamDay.add(id);
      }
    }
    const evalNames = TT.evalSubjectNames(state, idx);
    const unplaced = evalNames.filter((s) => !placed.has(s));
    const clashCount = Object.values(slotStats).reduce((t, s) => t + s.clashes.length, 0);

    return {
      students: n,
      days,
      slots: slotStats,
      maxPerDay,
      heavyAt,
      heavy: [...heavy],
      noExamDay: [...noExamDay],
      unplaced,
      evalCount: evalNames.length,
      clashCount,
      roomCount: state.rooms.length,
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
