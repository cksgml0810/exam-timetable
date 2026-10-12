/* 1단계: 나이스 학생편성현황 불러오기, 미응시·편의반 학생 지정 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;

  async function importFile(file) {
    try {
      const parsed = TT.parseWorkbook(new Uint8Array(await file.arrayBuffer()));
      const s = TT.store.state;
      if (s.data && !confirm('이미 불러온 데이터가 있습니다. 새 파일로 바꾸면 평가과목·시간표가 초기화됩니다. 계속할까요?')) return;
      TT.store.update((st) => TT.applyImport(st, parsed, file.name));
      TT.toast(`학생 ${parsed.students.length}명, 분반 ${parsed.sections.length}개를 불러왔습니다.`, 'ok');
      if (parsed.warnings.length) console.warn(parsed.warnings);
    } catch (e) {
      TT.toast(e.message, 'err');
    }
  }

  function dropzone(hasData) {
    const input = h('input', { type: 'file', accept: '.xlsx,.xls', style: { display: 'none' }, onchange: (e) => e.target.files[0] && importFile(e.target.files[0]) });
    const zone = h('div.dropzone' + (hasData ? '.slim' : ''), {
      onclick: () => input.click(),
      ondragover: (e) => { e.preventDefault(); zone.classList.add('over'); },
      ondragleave: () => zone.classList.remove('over'),
      ondrop: (e) => { e.preventDefault(); zone.classList.remove('over'); e.dataTransfer.files[0] && importFile(e.dataTransfer.files[0]); },
    },
    input,
    h('div.dz-icon', '⇪'),
    h('div', h('strong', hasData ? '다른 파일로 바꾸기' : '학생편성현황 엑셀 파일을 끌어다 놓거나 클릭하세요'),
      hasData ? null : h('p.muted', '나이스 ▸ 교육과정 ▸ 편제 및 과목개설관리 ▸ 수강생편성 ▸ 학기·학년 설정 ▸ 조회 ▸ 학생편성현황 ▸ 엑셀 출력')));
    return zone;
  }

  function render(state, idx) {
    if (!state.data) {
      return h('div.stack',
        dropzone(false),
        h('div.card.note',
          h('h3', '이 프로그램은'),
          h('ul',
            h('li', '모든 처리가 이 컴퓨터의 브라우저 안에서만 이루어집니다. 학생 정보는 외부로 전송되지 않습니다.'),
            h('li', '작업 내용은 자동 저장되며, [프로젝트 저장]으로 파일을 만들어 다른 컴퓨터에서 이어서 작업할 수 있습니다.'))));
    }
    const d = state.data;
    const classes = TT.classList(state);
    const excluded = Object.keys(state.excluded).filter((k) => state.excluded[k]).length;
    const special = Object.keys(state.special).filter((k) => state.special[k]).length;

    const kpi = (label, value, sub) => h('div.kpi', h('div.kpi-label', label), h('div.kpi-value', value), sub ? h('div.kpi-sub', sub) : null);

    let filter = '';
    const tbody = h('tbody', d.students.map((s) => {
      const subs = (idx.studentSubjects.get(s.id) || []).length;
      return h('tr', { 'data-q': `${s.id} ${s.cls}반 ${s.name}`, class: state.excluded[s.id] ? 'dim' : '' },
        h('td', s.id), h('td', s.cls + '반'), h('td', s.no), h('td', s.name),
        h('td.num', state.excluded[s.id] ? '-' : subs),
        h('td', h('label.switch', h('input', { type: 'checkbox', checked: state.excluded[s.id], onchange: (e) => TT.store.update((st) => { if (e.target.checked) st.excluded[s.id] = true; else delete st.excluded[s.id]; }) }), h('span', '시험 제외'))),
        h('td', h('label.switch', h('input', { type: 'checkbox', checked: state.special[s.id], onchange: (e) => TT.store.update((st) => { if (e.target.checked) st.special[s.id] = true; else delete st.special[s.id]; }) }), h('span', '편의반'))));
    }));
    const applyFilter = () => {
      for (const tr of tbody.children) tr.style.display = !filter || tr.dataset.q.includes(filter) ? '' : 'none';
    };

    return h('div.stack',
      h('div.kpis',
        kpi('파일', d.fileName, `${TT.fmt(d.rowCount)}행`),
        kpi('학생', TT.fmt(idx.active.length) + '명', excluded ? `전체 ${d.students.length}명 · 시험 제외 ${excluded}명` : `전체 ${d.students.length}명`),
        kpi('반', classes.length + '개', classes.map((c) => c).join(' · ')),
        kpi('과목', idx.subjects.length + '개', `분반 ${d.sections.length}개`),
        kpi('편의반', special + '명', '별도 고사실 응시')),
      dropzone(true),
      h('div.card',
        h('div.card-head', h('h3', '학생 명단'),
          h('input.search', { placeholder: '이름·학번·반 검색', oninput: (e) => { filter = e.target.value.trim(); applyFilter(); } })),
        h('p.muted', '이번 고사를 아예 보지 않는 학생(전학·장기결석 등)은 [시험 제외], 별도 고사실에서 보는 학생은 [편의반]으로 표시하세요.'),
        h('div.table-scroll', h('table.tbl.sticky',
          h('thead', h('tr', h('th', '학번'), h('th', '반'), h('th', '번호'), h('th', '성명'), h('th', '수강 과목'), h('th', ''), h('th', ''))),
          tbody))));
  }

  TT.registerStep({
    n: 1,
    title: '데이터 불러오기',
    desc: '나이스에서 내려받은 학생편성현황 엑셀 파일을 불러옵니다.',
    render,
    status: (s) => (s.data ? { kind: 'ok', text: '불러옴' } : { kind: 'todo', text: '파일 필요' }),
  });
})(window);
