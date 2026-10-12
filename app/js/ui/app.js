/* 앱 뼈대: 단계 사이드바, 상단 도구모음, 화면 다시 그리기
 * 각 단계 화면은 js/ui/stepN_*.js 에서 TT.registerStep({...}) 로 등록한다.
 */
(function (root) {
  const TT = (root.TT = root.TT || {});
  const { h } = TT;
  const steps = [];

  /** step: { n, title, desc, render(state, idx) → Node, status(state, idx) → {kind, text} } */
  TT.registerStep = (step) => {
    steps.push(step);
    steps.sort((a, b) => a.n - b.n);
  };

  TT.go = (n) => TT.store.update((s) => (s.step = n));

  function sidebar(state, idx) {
    return h('nav.sidebar',
      h('div.brand', h('div.logo', '시'), h('div', h('strong', '시험 시간표'), h('small', '고사 시간표 · 고사실 배치'))),
      h('ol.steps', steps.map((st) => {
        const status = st.status ? st.status(state, idx) : null;
        const locked = st.n > 1 && !state.data;
        return h('li', {
          class: [state.step === st.n ? 'active' : '', locked ? 'locked' : ''].join(' '),
          onclick: () => !locked && TT.go(st.n),
        },
        h('span.num', st.n),
        h('span.label', st.title),
        status ? h('span.dot.' + status.kind, { title: status.text }) : null);
      })),
      h('div.sidebar-foot',
        h('small', state.data ? `${state.data.fileName}` : '데이터 없음'),
        h('small', TT.store.savedAt ? `자동 저장됨 ${TT.store.savedAt.toLocaleTimeString('ko-KR')}` : '')));
  }

  function topbar(state) {
    const m = state.meta;
    const title = state.data
      ? `${m.year}학년도 ${m.semester}학기 ${m.grade}학년 ${m.examName}`
      : '나이스 학생편성현황 파일을 불러오세요';
    const fileInput = h('input', {
      type: 'file', accept: '.json', style: { display: 'none' },
      onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          TT.store.replace(JSON.parse(await f.text()));
          TT.toast('프로젝트를 불러왔습니다.', 'ok');
        } catch (err) {
          TT.toast('프로젝트 파일을 읽을 수 없습니다: ' + err.message, 'err');
        }
      },
    });
    return h('header.topbar',
      h('div.title', title),
      h('div.actions',
        fileInput,
        h('button.btn.ghost', { onclick: () => fileInput.click(), title: '저장해 둔 .json 프로젝트 열기' }, '프로젝트 열기'),
        h('button.btn.ghost', {
          title: '현재 작업을 .json 파일로 저장 (다른 컴퓨터에서 이어서 작업)',
          onclick: () => {
            const name = `시험시간표_${m.year || ''}_${m.semester || ''}_${m.grade || ''}_${m.examName || ''}.json`.replace(/_+/g, '_');
            TT.download(name, new Blob([TT.store.toJSON()], { type: 'application/json' }));
          },
        }, '프로젝트 저장'),
        h('button.btn.ghost.danger', {
          onclick: () => { if (confirm('모든 작업 내용을 지우고 새로 시작할까요?')) TT.store.reset(); },
        }, '새로 시작')));
  }

  function render() {
    const state = TT.store.state;
    const idx = TT.index(state);
    if (!state.data) state.step = 1;
    const step = steps.find((s) => s.n === state.step) || steps[0];
    const app = document.getElementById('app');
    const scroll = document.querySelector('main.content')?.scrollTop || 0;
    const focusId = document.activeElement?.id;
    app.replaceChildren(
      sidebar(state, idx),
      h('div.main',
        topbar(state),
        h('main.content',
          h('div.page-head',
            h('div', h('div.eyebrow', `${step.n}단계`), h('h1', step.title), step.desc ? h('p.desc', step.desc) : null),
            h('div.page-nav',
              step.n > 1 ? h('button.btn.ghost', { onclick: () => TT.go(step.n - 1) }, '← 이전') : null,
              step.n < steps.length && state.data ? h('button.btn.primary', { onclick: () => TT.go(step.n + 1) }, '다음 단계 →') : null)),
          step.render(state, idx))));
    const main = document.querySelector('main.content');
    if (main && TT._keepScroll) main.scrollTop = scroll;
    TT._keepScroll = true;
    if (focusId) document.getElementById(focusId)?.focus();
  }

  TT.render = render;
  TT.start = () => {
    TT.store.load();
    TT.store.subscribe((s) => {
      if (TT._lastStep !== s.step) TT._keepScroll = false;
      TT._lastStep = s.step;
      render();
    });
    TT._lastStep = TT.store.state.step;
    render();
  };
})(window);
