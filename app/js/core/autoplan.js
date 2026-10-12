/* 시간표 자동 배치 (휴리스틱 최적화)
 *
 * 규칙
 *   - 반드시: 공통 수강생이 있는 과목은 같은 교시에 놓지 않는다.
 *   - 목표(어기면 벌점): 학생 1명이 하루에 보는 과목 수 ≤ 최대, ≥ 최소
 *   - 목표: 한 교시의 분반 수 ≤ 고사실 수, 하루 부담을 고르게
 *   - 고정(🔒)된 과목은 움직이지 않는다. '미편성만 채우기'면 이미 놓인 과목도 그대로 둔다.
 * 방법: 탐욕 배치 → 담금질(simulated annealing)로 과목 이동·맞바꾸기, 여러 번 재시작해 가장 좋은 안 선택.
 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  const W = { unplaced: 1e7, over: 20000, under: 200, room: 300, spread: 1 }; // 최대 초과를 최소 미달보다 훨씬 무겁게

  function rng(seed) { // mulberry32 — 같은 seed면 같은 결과
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * @returns {{ schedule, cost, placed, unplaced:string[] }}
   * opts: { maxPerDay, minPerDay, mode:'all'|'fill', seed, iterations, restarts }
   */
  TT.autoPlan = (state, idx, opts = {}) => {
    const maxPerDay = opts.maxPerDay ?? 2;
    const minPerDay = opts.minPerDay ?? 0;
    const mode = opts.mode || 'all';
    const rand = rng(opts.seed || 1);
    const iterations = opts.iterations || 8000; // 재시작 1회당 이동 시도 수
    const timeBudget = opts.timeBudget ?? 1500; // ms — 이 시간 동안 재시작 반복
    const minRestarts = opts.restarts || 8;
    const maxRestarts = opts.maxRestarts || 200;

    const slots = TT.slots(state);
    const S = slots.length;
    const dayIds = [...new Set(slots.map((s) => s.dayId))];
    const D = dayIds.length;
    const slotDay = Int32Array.from(slots.map((s) => dayIds.indexOf(s.dayId)));
    const names = TT.evalSubjectNames(state, idx);
    const K = names.length;
    const N = idx.active.length;
    const sIdx = new Map(idx.active.map((s, i) => [s.id, i]));
    const members = names.map((n) => Int32Array.from([...idx.subjectByName.get(n).members].map((id) => sIdx.get(id))));
    const secs = names.map((n) => idx.subjectByName.get(n).sections.filter((x) => x.activeMembers.length).length);
    const rooms = state.rooms.length || Infinity;
    const O = names.map((a) => names.map((b) => (a === b ? 0 : TT.overlap(idx, a, b))));

    // 현재 배치
    const cur = new Int32Array(K).fill(-1);
    slots.forEach((sl, si) => TT.slotSubjects(state, idx, sl.key).forEach((n) => { const k = names.indexOf(n); if (k >= 0) cur[k] = si; }));
    const fixed = names.map((n, k) => cur[k] >= 0 && (state.locked?.[n] || mode === 'fill'));

    // 학생 1명·하루 벌점표 f(c)
    const f = new Float64Array(K + 2);
    for (let c = 0; c <= K + 1; c++) f[c] = Math.max(0, c - maxPerDay) * W.over + Math.max(0, minPerDay - c) * W.under + c * c * W.spread;
    const excess = (x) => Math.max(0, x - rooms) * W.room;

    function solve(startFromCurrent, noise) {
      const at = new Int32Array(K).fill(-1);
      const cnt = new Int16Array(D * N);
      const slotSec = new Int32Array(S);
      const slotList = Array.from({ length: S }, () => []);
      let cost = K * W.unplaced + D * N * f[0];

      /** 과목 k를 slot `to`(-1 = 빼기)로 옮기고 비용 변화량 반환 */
      function move(k, to) {
        const from = at[k];
        if (from === to) return 0;
        let delta = 0;
        const dFrom = from >= 0 ? slotDay[from] : -1;
        const dTo = to >= 0 ? slotDay[to] : -1;
        if (dFrom !== dTo) {
          const mk = members[k];
          for (let i = 0; i < mk.length; i++) {
            const m = mk[i];
            if (dFrom >= 0) { const p = dFrom * N + m; const c = cnt[p]; delta += f[c - 1] - f[c]; cnt[p] = c - 1; }
            if (dTo >= 0) { const p = dTo * N + m; const c = cnt[p]; delta += f[c + 1] - f[c]; cnt[p] = c + 1; }
          }
        }
        if (from >= 0) {
          delta += excess(slotSec[from] - secs[k]) - excess(slotSec[from]);
          slotSec[from] -= secs[k];
          slotList[from].splice(slotList[from].indexOf(k), 1);
        } else delta -= W.unplaced;
        if (to >= 0) {
          delta += excess(slotSec[to] + secs[k]) - excess(slotSec[to]);
          slotSec[to] += secs[k];
          slotList[to].push(k);
        } else delta += W.unplaced;
        at[k] = to;
        cost += delta;
        return delta;
      }
      const fits = (k, t, ignore = -1) => slotList[t].every((l) => l === ignore || O[k][l] === 0);

      // 1) 고정 과목, (재시작 0번이면) 현재 배치부터
      for (let k = 0; k < K; k++) if (cur[k] >= 0 && (fixed[k] || startFromCurrent) && fits(k, cur[k])) move(k, cur[k]);
      // 2) 남은 과목 탐욕 배치 (큰 과목 먼저, 동점이면 무작위)
      const order = [...Array(K).keys()].filter((k) => at[k] < 0)
        .sort((a, b) => members[b].length - members[a].length || rand() - 0.5);
      for (const k of order) {
        let best = -1, bestD = Infinity;
        for (let t = 0; t < S; t++) {
          if (!fits(k, t)) continue;
          const d = move(k, t) + rand() * noise;
          move(k, -1);
          if (d < bestD) { bestD = d; best = t; }
        }
        if (best >= 0) move(k, best);
      }
      // 3) 담금질
      const free = [...Array(K).keys()].filter((k) => !fixed[k]);
      if (free.length && S > 1) {
        const T0 = 2000, T1 = 0.3;
        for (let it = 0; it < iterations; it++) {
          const T = T0 * Math.pow(T1 / T0, it / iterations);
          const k = free[(rand() * free.length) | 0];
          const from = at[k];
          const to = (rand() * S) | 0;
          if (to === from) continue;
          if (fits(k, to)) {
            const d = move(k, to);
            if (d > 0 && rand() >= Math.exp(-d / T)) move(k, from);
          } else if (from >= 0) {
            // 맞바꾸기: to 칸에서 k와 충돌하는 과목이 하나뿐이고 움직일 수 있으면
            const clash = slotList[to].filter((l) => O[k][l] > 0);
            if (clash.length !== 1 || fixed[clash[0]]) continue;
            const l = clash[0];
            if (!fits(l, from, k)) continue;
            const d = move(l, -1) + move(k, to) + move(l, from);
            if (d > 0 && rand() >= Math.exp(-d / T)) { move(l, -1); move(k, from); move(l, to); }
          }
        }
      }
      return { at: Int32Array.from(at), cost };
    }

    // 여러 번 재시작: 0번은 현재 배치에서, 나머지는 무작위성을 키운 탐욕 배치에서 출발
    let best = null;
    const t0 = Date.now();
    for (let r = 0; r < maxRestarts; r++) {
      if (r >= minRestarts && Date.now() - t0 > timeBudget) break;
      const res = solve(r === 0, r === 0 ? 5 : W.over * (0.05 + 0.3 * rand()));
      if (!best || res.cost < best.cost) best = res;
    }

    const schedule = {};
    // 사용하지 않는 칸(미사용 교시)에 있던 고정 과목도 유지
    for (const [key, list] of Object.entries(state.schedule)) {
      if (!slots.some((s) => s.key === key)) schedule[key] = list.slice();
    }
    const unplaced = [];
    names.forEach((n, k) => {
      const t = best.at[k];
      if (t < 0) { unplaced.push(n); return; }
      (schedule[slots[t].key] = schedule[slots[t].key] || []).push(n);
    });
    return { schedule, cost: best.cost, unplaced };
  };

  /** 규칙 기준 위반 학생 (scheduleStats 결과 사용) */
  TT.ruleStats = (state, st, rules) => {
    const activeDays = new Set(TT.slots(state).map((s) => s.dayId));
    const over = new Set();
    const under = new Set();
    for (const d of st.days) {
      if (!activeDays.has(d.dayId)) continue;
      for (const [id, list] of d.perStudent) {
        if (list.length > rules.maxPerDay) over.add(id);
        if (list.length < rules.minPerDay) under.add(id);
      }
    }
    const roomShort = Object.values(st.slots).filter((s) => s.sections > st.roomCount).length;
    return { over: [...over], under: [...under], roomShort, activeDays: [...activeDays] };
  };
})(typeof window !== 'undefined' ? window : globalThis);
