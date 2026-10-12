/* 4단계: 과목 확인 — 과목별 분반·인원 조회 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;

  function render(state, idx) {
    const total = idx.subjects.reduce((t, s) => t + s.count, 0);
    const rows = [];
    let lastGroup = null;
    for (const subj of idx.subjects) {
      const secs = subj.sections.filter((x) => x.activeMembers.length);
      rows.push(h('tr',
        h('td.muted', subj.group !== lastGroup ? subj.group : ''),
        h('td', h('strong', subj.name)),
        h('td.num', secs.length),
        h('td.num', TT.fmt(subj.count)),
        h('td', h('div.sec-chips', secs.map((x) => h('span.sec', { title: x.room }, (isNaN(x.roomCls) ? x.room : x.roomCls + '반') + ' ', h('b', x.activeMembers.length)))))));
      lastGroup = subj.group;
    }
    return h('div.card',
      h('div.card-head', h('h3', `과목 ${idx.subjects.length}개`), h('span.muted', `수강 인원 합계 ${TT.fmt(total)}명`)),
      h('p.muted', '분반 표시: 개설강의실 기준 반 · 인원. 이 화면은 조회만 가능합니다. 이상이 없으면 다음 단계로 이동하세요.'),
      h('table.tbl',
        h('thead', h('tr', h('th', '편제'), h('th', '과목'), h('th.num', '분반'), h('th.num', '학생'), h('th', '분반별 인원'))),
        h('tbody', rows)));
  }

  TT.registerStep({ n: 4, title: '과목 확인', desc: '불러온 과목과 분반별 인원을 확인합니다.', render, status: () => ({ kind: 'ok', text: '조회' }) });
})(window);
