/* 5단계: 평가 과목 선택 + 과목 간 충돌표 + 동시 시험 가능 조합 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;

  function render(state, idx) {
    const evalNames = TT.evalSubjectNames(state, idx);
    const evalTotal = evalNames.reduce((t, s) => t + idx.subjectByName.get(s).count, 0);

    // 과목 선택 (편제별 묶음)
    const groups = new Map();
    idx.subjects.forEach((s) => (groups.get(s.group) || groups.set(s.group, []).get(s.group)).push(s));
    const pick = h('div.card',
      h('div.card-head', h('h3', `평가 과목 ${evalNames.length}개 선택`),
        h('div.btn-row',
          h('button.btn.ghost', { onclick: () => up((s) => idx.subjects.forEach((x) => (s.evalSubjects[x.name] = true))) }, '모두 선택'),
          h('button.btn.ghost', { onclick: () => up((s) => (s.evalSubjects = {})) }, '모두 해제'))),
      h('div.pick-groups', [...groups].map(([g, list]) => h('div.pick-group',
        h('div.pick-title', g || '기타'),
        list.map((s) => h('label.pick' + (state.evalSubjects[s.name] ? '.on' : ''),
          h('input', { type: 'checkbox', checked: !!state.evalSubjects[s.name], onchange: (e) => up((st) => { if (e.target.checked) st.evalSubjects[s.name] = true; else delete st.evalSubjects[s.name]; }) }),
          h('span.pick-name', s.name),
          h('span.pick-meta', `${s.sections.filter((x) => x.activeMembers.length).length}반 · ${s.count}명`)))))),
      h('div.summary-line', h('span', `평가 과목 응시 인원 합계 ${TT.fmt(evalTotal)}명`)));

    if (evalNames.length < 2) return h('div.stack', pick);

    // 충돌표 (히트맵)
    const max = Math.max(1, ...evalNames.flatMap((a) => evalNames.map((b) => (a === b ? 0 : TT.overlap(idx, a, b)))));
    const matrix = h('div.card',
      h('div.card-head', h('h3', '과목 간 공통 수강생'), h('span.muted', '0 = 같은 교시에 동시 시험 가능')),
      h('div.table-scroll', h('table.matrix',
        h('thead', h('tr', h('th', ''), evalNames.map((n) => h('th.vert', h('span', TT.shortName(n)))))),
        h('tbody', evalNames.map((a) => h('tr',
          h('th.row', TT.shortName(a)),
          evalNames.map((b) => {
            if (a === b) return h('td.self', '');
            const v = TT.overlap(idx, a, b);
            return h('td' + (v ? '' : '.zero'), {
              title: `${TT.shortName(a)} × ${TT.shortName(b)}: 공통 수강생 ${v}명`,
              style: v ? { background: `color-mix(in srgb, var(--heat) ${Math.round(12 + 70 * v / max)}%, transparent)` } : null,
            }, v || '0');
          })))))));

    const combos = TT.compatibleGroups(idx, evalNames);
    const comboCard = h('div.card',
      h('div.card-head', h('h3', '동시 시험 가능 조합'), h('span.muted', combos.length ? `${combos.length}개` : '')),
      combos.length
        ? h('ul.combos', combos.slice(0, 40).map((g) => h('li',
          g.map((s) => h('span.chip', TT.shortName(s), h('small', ' ' + idx.subjectByName.get(s).count))),
          h('span.muted', ` 합계 ${g.reduce((t, s) => t + idx.subjectByName.get(s).count, 0)}명`))))
        : h('p.muted', '선택한 평가 과목 중에는 같은 교시에 함께 볼 수 있는 과목이 없습니다. (모든 과목 쌍에 공통 수강생이 있음)'));

    return h('div.stack', pick, h('div.grid-2', comboCard, matrix));
  }

  TT.registerStep({
    n: 5,
    title: '평가 과목',
    desc: '이번 고사에서 시험을 보는 과목을 고릅니다. 공통 수강생이 없는 과목끼리는 같은 교시에 볼 수 있습니다.',
    render,
    status: (s, idx) => (idx && TT.evalSubjectNames(s, idx).length ? { kind: 'ok', text: '선택됨' } : { kind: 'todo', text: '선택 필요' }),
  });
})(window);
