/* 2단계: 기초 정보 — 고사명, 시험 일자, 교시·시간 (개수 제한 없음) */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;

  function field(label, value, onchange, attrs = {}) {
    return h('label.field', h('span', label), h('input', { value, onchange: (e) => onchange(e.target.value), ...attrs }));
  }

  function move(arr, i, d) {
    const j = i + d;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  function render(state) {
    const m = state.meta;
    const metaCard = h('div.card',
      h('h3', '고사 정보'),
      h('div.form-row',
        field('학년도', m.year, (v) => up((s) => (s.meta.year = v)), { id: 'f-year', style: { width: '90px' } }),
        field('학기', m.semester, (v) => up((s) => (s.meta.semester = v)), { id: 'f-sem', style: { width: '60px' } }),
        field('학년', m.grade, (v) => up((s) => (s.meta.grade = v)), { id: 'f-grade', style: { width: '60px' } }),
        field('고사명', m.examName, (v) => up((s) => (s.meta.examName = v)), { id: 'f-exam', style: { width: '200px' } })));

    const periodsCard = h('div.card',
      h('div.card-head', h('h3', '교시와 시간'),
        h('button.btn', { onclick: () => up((s) => s.periods.push({ id: TT.uid('p'), name: `${s.periods.length + 1}교시`, time: '' })) }, '+ 교시 추가')),
      h('table.tbl',
        h('thead', h('tr', h('th', '교시'), h('th', '시간'), h('th', ''))),
        h('tbody', state.periods.map((p, i) => h('tr',
          h('td', h('input', { id: 'pn-' + p.id, value: p.name, onchange: (e) => up((s) => (s.periods[i].name = e.target.value)), style: { width: '90px' } })),
          h('td', h('input', { id: 'pt-' + p.id, value: p.time, placeholder: '08:50~09:40', onchange: (e) => up((s) => (s.periods[i].time = e.target.value)), style: { width: '140px' } })),
          h('td.row-actions',
            h('button.btn.icon-btn', { title: '위로', onclick: () => up((s) => move(s.periods, i, -1)) }, '↑'),
            h('button.btn.icon-btn', { title: '아래로', onclick: () => up((s) => move(s.periods, i, 1)) }, '↓'),
            h('button.btn.icon-btn.danger', {
              title: '삭제',
              onclick: () => up((s) => {
                s.periods.splice(i, 1);
                for (const k of Object.keys(s.schedule)) if (k.endsWith('|' + p.id)) delete s.schedule[k];
              }),
            }, '×')))))));

    const daysCard = h('div.card',
      h('div.card-head', h('h3', '시험 일자'),
        h('button.btn', { onclick: () => up((s) => s.days.push({ id: TT.uid('d'), date: '' })) }, '+ 일자 추가')),
      h('p.muted', '날짜별로 시험을 보지 않는 교시는 체크를 해제하세요.'),
      h('table.tbl',
        h('thead', h('tr', h('th', '구분'), h('th', '날짜'), state.periods.map((p) => h('th.center', p.name)), h('th', ''))),
        h('tbody', state.days.map((d, i) => h('tr',
          h('td', h('strong', `${i + 1}일차`)),
          h('td', h('input', { id: 'dd-' + d.id, type: 'date', value: d.date, onchange: (e) => up((s) => (s.days[i].date = e.target.value)) }),
            d.date ? h('span.muted', ' ' + TT.dayLabel(state, d.id, { short: true }).replace(/^.*\(/, '(')) : null),
          state.periods.map((p) => {
            const key = TT.slotKey(d.id, p.id);
            return h('td.center', h('input', {
              type: 'checkbox', checked: !state.off[key],
              onchange: (e) => up((s) => { if (e.target.checked) delete s.off[key]; else s.off[key] = true; }),
            }));
          }),
          h('td.row-actions',
            h('button.btn.icon-btn.danger', {
              title: '삭제',
              onclick: () => {
                const used = state.periods.some((p) => (state.schedule[TT.slotKey(d.id, p.id)] || []).length);
                if (used && !confirm(`${i + 1}일차에 배치된 과목이 있습니다. 삭제할까요?`)) return;
                up((s) => {
                  s.days.splice(i, 1);
                  for (const k of Object.keys(s.schedule)) if (k.startsWith(d.id + '|')) delete s.schedule[k];
                });
              },
            }, '×')))))));

    return h('div.grid-2', h('div.stack', metaCard, periodsCard), daysCard);
  }

  TT.registerStep({
    n: 2,
    title: '기초 정보',
    desc: '고사명과 시험 일자·교시를 정합니다. 일자와 교시는 필요한 만큼 추가할 수 있습니다.',
    render,
    status: (s) => (s.days.length && s.days.every((d) => d.date) && s.periods.length
      ? { kind: 'ok', text: '입력 완료' }
      : { kind: 'warn', text: '날짜 입력 필요' }),
  });
})(window);
