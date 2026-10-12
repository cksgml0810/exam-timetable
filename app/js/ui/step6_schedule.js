/* 6단계: 시간표 작성 + 실시간 학생 부담 대시보드
 *
 * 과목 고르기: 위쪽 '미편성 과목'에서 클릭(또는 끌기) → 칸 클릭(또는 놓기)
 *   초록 칸 = 놓을 수 있음, 빨간 칸 = 공통 수강생이 있어 불가
 * 대시보드: 일자별로 학생이 보는 과목 수(0·1·2·3+) 분포, 하루 최대 과목 수, 시험 없는 학생 수
 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;
  let selected = null; // 선택한 과목명 (화면 상태)
  const undoStack = []; // 이전 시간표들 (되돌리기)
  let lastRun = null; // 마지막 자동 배치 결과 요약
  let running = false;

  const select = (name) => { selected = selected === name ? null : name; TT.render(); };

  /** 시간표를 바꾸기 전에 되돌리기용으로 저장 */
  function changeSchedule(mutator) {
    undoStack.push(JSON.stringify(TT.store.state.schedule));
    if (undoStack.length > 30) undoStack.shift();
    up(mutator);
  }

  function undo() {
    if (!undoStack.length) return;
    const prev = JSON.parse(undoStack.pop());
    lastRun = null;
    up((s) => (s.schedule = prev));
  }

  const rulesOf = (state) => ({ maxPerDay: 2, minPerDay: 1, mode: 'all', ...state.planRules });

  function summarize(state, idx, schedule) {
    const st = TT.scheduleStats({ ...state, schedule }, idx);
    const rs = TT.ruleStats(state, st, rulesOf(state));
    return { max: st.maxPerDay, over: rs.over.length, under: rs.under.length, unplaced: st.unplaced.length, roomShort: rs.roomShort };
  }

  function runAuto(seed) {
    const state = TT.store.state;
    const idx = TT.index(state);
    const rules = rulesOf(state);
    running = true;
    TT.render();
    setTimeout(() => {
      try {
        const before = summarize(state, idx, state.schedule);
        const res = TT.autoPlan(state, idx, { ...rules, seed });
        const after = summarize(state, idx, res.schedule);
        lastRun = { before, after, seed };
        selected = null;
        changeSchedule((s) => (s.schedule = res.schedule));
      } finally {
        running = false;
        TT.render();
      }
    }, 30);
  }

  /** 규칙상 불가능한 학생: 평가과목 수 > 시험일 수 × 하루 최대 */
  function infeasible(state, idx, rules) {
    const days = new Set(TT.slots(state).map((s) => s.dayId)).size;
    const limit = days * rules.maxPerDay;
    const out = [];
    for (const [id, list] of idx.studentSubjects) {
      const n = list.filter((x) => state.evalSubjects[x]).length;
      if (n > limit) out.push(id);
    }
    return { ids: out, limit, days };
  }

  function autoCard(state, idx) {
    const rules = rulesOf(state);
    const setRule = (k, v) => { lastRun = null; up((s) => (s.planRules = { ...rulesOf(s), [k]: v })); };
    const num = (k, min, max) => h('input', { type: 'number', min, max, value: rules[k], style: { width: '64px' }, onchange: (e) => setRule(k, Math.max(min, Math.min(max, parseInt(e.target.value, 10) || 0))) });
    const lockedCount = Object.keys(state.locked || {}).filter((n) => state.locked[n] && Object.values(state.schedule).some((l) => l.includes(n))).length;
    const inf = infeasible(state, idx, rules);
    const evalCount = TT.evalSubjectNames(state, idx).length;
    const slotCount = TT.slots(state).length;

    const cmp = (label, b, a, goodLow = true) => {
      const better = goodLow ? a < b : a > b;
      const worse = goodLow ? a > b : a < b;
      return h('span.cmp', label + ' ', h('s.muted', b), ' → ', h('strong', { class: better ? 'text-ok' : worse ? 'text-err' : '' }, a));
    };

    return h('div.card.auto-card',
      h('div.card-head',
        h('div', h('h3', '자동 배치'), h('p.muted', '목표를 정하고 실행하면 조건에 가장 잘 맞는 시간표를 제안합니다. 결과를 보고 칸을 직접 옮겨 다듬으세요.')),
        h('div.btn-row',
          undoStack.length ? h('button.btn.ghost', { onclick: undo, title: '직전 시간표로 되돌리기' }, '↶ 되돌리기') : null,
          lastRun ? h('button.btn', { disabled: running, onclick: () => runAuto(lastRun.seed + 1) }, '다른 안') : null,
          h('button.btn.primary', { disabled: running, onclick: () => runAuto(1) }, running ? '계산 중…' : '자동 배치 실행'))),
      h('div.rule-row',
        h('label.rule', h('span', '학생 1명 하루 최대'), num('maxPerDay', 1, 9), h('span', '과목')),
        h('label.rule', h('span', '학생 1명 하루 최소'), num('minPerDay', 0, 9), h('span', '과목')),
        h('label.rule', h('span', '방식'),
          h('select', { onchange: (e) => setRule('mode', e.target.value) },
            h('option', { value: 'all', selected: rules.mode === 'all' }, '🔒 고정 과목 외 전체 다시 배치'),
            h('option', { value: 'fill', selected: rules.mode === 'fill' }, '이미 놓은 과목은 두고 미편성만 채우기'))),
        h('span.muted', `고정 ${lockedCount}과목 · 평가과목 ${evalCount}개 / 사용 칸 ${slotCount}개`)),
      inf.ids.length ? h('div.alert.warn',
        `평가과목이 ${inf.limit}개(시험일 ${inf.days}일 × 하루 최대 ${rules.maxPerDay})를 넘는 학생이 ${inf.ids.length}명 있어 최대 조건을 모두 지킬 수 없습니다. 시험일을 늘리거나 하루 최대를 올리세요. `,
        h('a.link', { onclick: () => TT.modal('최대 조건을 지킬 수 없는 학생', TT.studentTable(idx, inf.ids, { title: '평가과목 수', value: (s) => idx.studentSubjects.get(s.id).filter((x) => state.evalSubjects[x]).length })) }, '명단')) : null,
      lastRun ? h('div.result-line',
        h('span', h('strong', '결과')),
        cmp(`하루 ${rules.maxPerDay}과목 초과`, lastRun.before.over, lastRun.after.over),
        rules.minPerDay ? cmp(`하루 ${rules.minPerDay}과목 미만`, lastRun.before.under, lastRun.after.under) : null,
        cmp('미편성', lastRun.before.unplaced, lastRun.after.unplaced),
        cmp('고사실 부족 칸', lastRun.before.roomShort, lastRun.after.roomShort),
        lastRun.after.over ? h('span.muted', '— 초과가 남으면 시험일·교시를 늘리거나 동시 시험 과목을 확인하세요.') : null) : null);
  }

  function removeEverywhere(s, name) {
    for (const k of Object.keys(s.schedule)) {
      s.schedule[k] = s.schedule[k].filter((x) => x !== name);
      if (!s.schedule[k].length) delete s.schedule[k];
    }
  }

  function place(name, key) {
    const state = TT.store.state;
    const idx = TT.index(state);
    const conf = TT.placeConflicts(idx, name, TT.slotSubjects(state, idx, key));
    if (conf.length) {
      TT.toast(`놓을 수 없음: ${conf.map((c) => `${TT.shortName(c.subject)}(공통 ${c.count}명)`).join(', ')}`, 'err');
      return;
    }
    selected = null;
    changeSchedule((s) => {
      removeEverywhere(s, name);
      (s.schedule[key] = s.schedule[key] || []).push(name);
    });
  }

  function unplace(name) {
    if (selected === name) selected = null;
    changeSchedule((s) => removeEverywhere(s, name));
  }

  const toggleLock = (name) => up((s) => {
    s.locked = s.locked || {};
    if (s.locked[name]) delete s.locked[name];
    else s.locked[name] = true;
  });

  /** 선택 과목을 각 일자에 넣었을 때 그날 최대 과목 수 미리보기 */
  function previewMax(idx, day, name, currentKeyDay) {
    const members = idx.subjectByName.get(name).members;
    let max = 0;
    for (const [id, list] of day.perStudent) {
      let c = list.length;
      if (currentKeyDay) c -= list.includes(name) ? 1 : 0;
      if (members.has(id)) c += 1;
      if (c > max) max = c;
    }
    return max;
  }

  /* ---------- 일자별 분포 막대 ---------- */
  const BUCKETS = [
    { label: '0과목', test: (c) => c === 0, cls: 'b0' },
    { label: '1과목', test: (c) => c === 1, cls: 'b1' },
    { label: '2과목', test: (c) => c === 2, cls: 'b2' },
    { label: '3과목+', test: (c) => c >= 3, cls: 'b3' },
  ];

  function bucketIds(day, test) {
    const out = [];
    for (const [id, list] of day.perStudent) if (test(list.length)) out.push(id);
    return out;
  }

  function showStudents(state, idx, day, bucket) {
    const ids = bucketIds(day, bucket.test);
    TT.modal(`${TT.dayLabel(state, day.dayId)} · ${bucket.label} 학생 ${ids.length}명`,
      TT.studentTable(idx, ids, { title: '이 날 보는 과목', value: (s) => (day.perStudent.get(s.id) || []).map(TT.shortName).join(', ') || '없음' }));
  }

  function distBar(state, idx, day, total) {
    const rules = rulesOf(state);
    return h('div.dist',
      h('div.dist-bar', BUCKETS.map((b) => {
        const n = bucketIds(day, b.test).length;
        if (!n) return null;
        return h('button.seg.' + b.cls, {
          style: { flexGrow: n },
          title: `${b.label}: ${n}명 (클릭하면 명단)`,
          onclick: () => showStudents(state, idx, day, b),
        }, n >= total * 0.08 ? String(n) : '');
      })),
      h('div.dist-meta',
        h('span', { class: day.max > rules.maxPerDay ? 'text-warn' : '' }, `최대 ${day.max}과목`),
        h('span', { class: day.zero.length && day.hasExam ? 'text-info' : 'muted' }, `시험 없음 ${day.zero.length}명`)));
  }

  /* ---------- 칸 ---------- */
  function cell(state, idx, st, day, period) {
    const key = TT.slotKey(day.id, period.id);
    if (state.off[key]) return h('td.slot.off', h('span.muted', '미사용'));
    const info = st.slots[key];
    const subs = info.subjects;
    let mode = '';
    let hint = null;
    if (selected) {
      const conf = TT.placeConflicts(idx, selected, subs);
      if (subs.includes(selected)) mode = 'here';
      else if (conf.length) {
        mode = 'cannot';
        hint = h('div.hint', '공통 ' + conf.map((c) => `${TT.shortName(c.subject)} ${c.count}명`).join(', '));
      } else {
        mode = 'can';
        const dayStat = st.days.find((d) => d.dayId === day.id);
        const already = dayStat.subjects.includes(selected);
        const pm = previewMax(idx, dayStat, selected, already);
        hint = h('div.hint', `놓으면 이 날 최대 ${pm}과목`);
      }
    }
    const roomsShort = info.sections > st.roomCount;
    const td = h('td.slot' + (mode ? '.' + mode : ''), {
      onclick: () => selected && mode === 'can' && place(selected, key),
      ondragover: (e) => { if (mode !== 'cannot') e.preventDefault(); },
      ondrop: (e) => { e.preventDefault(); const n = e.dataTransfer.getData('text/plain'); n && place(n, key); },
    },
    subs.map((name) => h('div.subj' + (selected === name ? '.sel' : '') + (state.locked?.[name] ? '.locked' : ''), {
      draggable: 'true',
      ondragstart: (e) => { e.dataTransfer.setData('text/plain', name); selected = name; requestAnimationFrame(TT.render); },
      onclick: (e) => { e.stopPropagation(); select(name); },
      title: name,
    },
    h('span', TT.shortName(name)),
    h('small', idx.subjectByName.get(name).count),
    h('button.lock', {
      title: state.locked?.[name] ? '고정 풀기' : '고정 — 자동 배치 때 이 칸에 그대로 둡니다',
      onclick: (e) => { e.stopPropagation(); toggleLock(name); },
    }, state.locked?.[name] ? '🔒' : '🔓'),
    h('button.x', { title: '빼기', onclick: (e) => { e.stopPropagation(); unplace(name); } }, '×'))),
    subs.length ? h('div.slot-meta',
      h('span', `응시 ${info.takers} · 대기 ${info.waiting}`),
      h('span', { class: roomsShort ? 'text-warn' : '' }, `분반 ${info.sections}/${st.roomCount}실`)) : null,
    info.clashes.length ? h('div.text-err', `충돌 ${info.clashes.length}명`) : null,
    hint);
    return td;
  }

  function render(state, idx) {
    const st = TT.scheduleStats(state, idx);
    const evalNames = TT.evalSubjectNames(state, idx);
    if (!evalNames.length) {
      return h('div.card', h('p', '먼저 5단계에서 평가 과목을 선택하세요.'), h('button.btn.primary', { onclick: () => TT.go(5) }, '평가 과목 선택하기'));
    }
    if (selected && !evalNames.includes(selected)) selected = null;

    const kpi = (label, value, kind, sub, onclick) => h('div.kpi' + (kind ? '.' + kind : '') + (onclick ? '.clickable' : ''), { onclick },
      h('div.kpi-label', label), h('div.kpi-value', value), sub ? h('div.kpi-sub', sub) : null);
    const examDays = st.days.filter((d) => d.hasExam).length;

    const rules = rulesOf(state);
    const rs = TT.ruleStats(state, st, rules);
    const perDayCounts = (s) => st.days.filter((d) => rs.activeDays.includes(d.dayId)).map((d) => d.perStudent.get(s.id).length).join(' · ');
    const kpis = h('div.kpis',
      kpi('편성', `${st.evalCount - st.unplaced.length} / ${st.evalCount}`, st.unplaced.length ? '' : 'good', st.unplaced.length ? `미편성 ${st.unplaced.length}과목` : '모두 편성'),
      kpi('하루 최대 응시', `${st.maxPerDay}과목`, st.maxPerDay > rules.maxPerDay ? 'warn' : 'good', `목표 ${rules.maxPerDay}과목 이하`),
      kpi(`하루 ${rules.maxPerDay}과목 초과`, `${rs.over.length}명`, rs.over.length ? 'warn' : 'good', rs.over.length ? '클릭하면 명단' : '목표 달성',
        rs.over.length ? () => TT.modal(`하루 ${rules.maxPerDay}과목을 넘게 보는 학생`, TT.studentTable(idx, rs.over, { title: '일자별 과목 수', value: perDayCounts })) : null),
      rules.minPerDay
        ? kpi(`하루 ${rules.minPerDay}과목 미만`, `${rs.under.length}명`, rs.under.length ? '' : 'good', rs.under.length ? '클릭하면 명단' : '목표 달성',
          rs.under.length ? () => TT.modal(`하루 ${rules.minPerDay}과목보다 적게 보는 날이 있는 학생`, TT.studentTable(idx, rs.under, { title: '일자별 과목 수', value: perDayCounts })) : null)
        : kpi('시험 없는 날이 있는 학생', `${st.noExamDay.length}명`, '', `시험일 ${examDays}일 중`,
          st.noExamDay.length ? () => TT.modal('시험 없는 날이 있는 학생', TT.studentTable(idx, st.noExamDay, { title: '일자별 과목 수', value: perDayCounts })) : null),
      st.clashCount ? kpi('충돌', `${st.clashCount}명`, 'bad', '같은 교시 2과목') : null);

    const palette = h('div.card.palette',
      h('div.card-head', h('h3', st.unplaced.length ? `미편성 과목 ${st.unplaced.length}` : '모든 과목을 편성했습니다'),
        h('div.btn-row',
          selected ? h('span.muted', `선택: ${TT.shortName(selected)} — 초록 칸을 클릭하세요`) : h('span.muted', '과목을 클릭한 뒤 칸을 클릭하거나, 끌어서 놓으세요.'),
          Object.keys(state.schedule).length ? h('button.btn.ghost.danger', { onclick: () => confirm('시간표를 모두 비울까요? (되돌리기 가능)') && changeSchedule((s) => (s.schedule = {})) }, '시간표 비우기') : null)),
      h('div.palette-chips', st.unplaced.map((name) => h('div.subj.free' + (selected === name ? '.sel' : ''), {
        draggable: 'true',
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', name); selected = name; requestAnimationFrame(TT.render); },
        onclick: () => select(name),
        title: name,
      }, h('span', TT.shortName(name)), h('small', idx.subjectByName.get(name).count)))));

    const grid = h('div.card.grid-card', h('div.table-scroll', h('table.timetable',
      h('thead', h('tr', h('th.corner', ''), state.days.map((d) => h('th', TT.dayLabel(state, d.id))))),
      h('tbody',
        state.periods.map((p) => h('tr',
          h('th.period', h('div', p.name), h('small', p.time)),
          state.days.map((d) => cell(state, idx, st, d, p)))),
        h('tr.dist-row',
          h('th.period', h('div', '학생 부담'), h('small', '일자별 과목 수')),
          st.days.map((d) => h('td', d.hasExam ? distBar(state, idx, d, st.students) : h('span.muted', '시험 없음'))))))),
      h('div.legend', BUCKETS.map((b) => h('span', h('i.sw.' + b.cls), b.label)), h('span.muted', '막대를 클릭하면 해당 학생 명단을 볼 수 있습니다.')));

    // 일자별 상세 표
    const maxBucket = Math.max(3, st.maxPerDay);
    const table = h('div.card',
      h('h3', '일자별 학생 응시 과목 수'),
      h('table.tbl',
        h('thead', h('tr', h('th', '일자'), h('th', '시험 과목'),
          Array.from({ length: maxBucket + 1 }, (_, i) => h('th.num', `${i}과목`)), h('th.num', '최대'))),
        h('tbody', st.days.map((d) => h('tr',
          h('td', TT.dayLabel(state, d.dayId)),
          h('td', d.subjects.map(TT.shortName).join(', ') || h('span.muted', '-')),
          Array.from({ length: maxBucket + 1 }, (_, i) => {
            const n = d.dist[i] || 0;
            return h('td.num', n ? h('a.link', { onclick: () => showStudents(state, idx, d, { label: `${i}과목`, test: (c) => c === i }) }, TT.fmt(n)) : h('span.muted', '0'));
          }),
          h('td.num', h('strong', d.max)))))));

    return h('div.stack', autoCard(state, idx), kpis, palette, grid, table);
  }

  TT.registerStep({
    n: 6,
    title: '시간표 작성',
    desc: '하루 최대·최소 과목 수를 정해 자동 배치한 뒤, 칸을 직접 옮겨 다듬습니다. 🔒 고정한 과목은 다시 실행해도 움직이지 않습니다.',
    render,
    status: (s, idx) => {
      if (!idx) return null;
      const st = TT.scheduleStats(s, idx);
      if (!st.evalCount) return { kind: 'todo', text: '평가 과목 필요' };
      if (st.clashCount) return { kind: 'err', text: '충돌' };
      return st.unplaced.length ? { kind: 'warn', text: `미편성 ${st.unplaced.length}` } : { kind: 'ok', text: '편성 완료' };
    },
  });
})(window);
