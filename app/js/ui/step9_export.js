/* 9단계: 엑셀 출력 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;
  let busy = false;
  let pvSheet = 'overview';
  let pvPage = 0;
  const pvCache = { key: null, ws: null, pages: null };

  /** 미리보기용 시트 (배치·설정이 바뀔 때만 다시 만듦) */
  function previewSheet(state, idx, pl) {
    const key = pvSheet + '|' + JSON.stringify([state.meta, state.days, state.periods, state.rooms, state.schedule, state.evalSubjects,
      state.placement, state.splits, state.roomRoles, state.roomMode, state.clusterAt, state.waitMode, state.seatMode, state.seatSeed, state.seatCols,
      state.special, state.excluded, state.convRoom, state.studentNotice, state.roomNotice]);
    if (pvCache.key !== key) {
      const wb = TT.buildWorkbook(state, idx, pl, [pvSheet]);
      pvCache.key = key;
      pvCache.ws = wb.worksheets[0];
      pvCache.pages = TT.sheetPages(pvCache.ws);
    }
    return pvCache;
  }

  function previewCard(state, idx, pl) {
    const { ws, pages } = previewSheet(state, idx, pl);
    pvPage = Math.max(0, Math.min(pvPage, pages.length - 1));
    const go = (d) => { pvPage += d; TT.render(); };
    const pageSel = h('select', { onchange: (e) => { pvPage = +e.target.value; TT.render(); } },
      pages.map((p, i) => h('option', { value: i, selected: i === pvPage }, `${i + 1}쪽`)));
    return h('div.card',
      h('div.card-head', h('h3', '미리 보기'),
        h('div.btn-row',
          h('button.btn.icon-btn', { disabled: pvPage === 0, onclick: () => go(-1) }, '‹'),
          pageSel,
          h('span.muted', `/ ${pages.length}쪽`),
          h('button.btn.icon-btn', { disabled: pvPage >= pages.length - 1, onclick: () => go(1) }, '›'))),
      h('div.chips.sheet-tabs', TT.EXCEL_SHEETS.map((sh) => h('button.chip' + (sh.id === pvSheet ? '.on' : ''), {
        onclick: () => { pvSheet = sh.id; pvPage = 0; TT.render(); },
      }, sh.name))),
      h('div.paper-wrap', TT.renderSheetPage(ws, pages[pvPage])),
      h('p.muted', 'A4 한 쪽 단위로 보여 줍니다. 실제 인쇄는 엑셀에서 [인쇄 미리 보기]로 한 번 더 확인하세요.'));
  }

  async function exportExcel(state, idx, pl, ids) {
    busy = true;
    TT.render();
    try {
      const wb = TT.buildWorkbook(state, idx, pl, ids);
      const buf = await wb.xlsx.writeBuffer();
      const m = state.meta;
      const name = `${m.year}_${m.grade}학년_${m.semester}학기_${m.examName}_시험시간표.xlsx`.replace(/\s+/g, '');
      TT.download(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      TT.toast('엑셀 파일을 만들었습니다. 다운로드 폴더를 확인하세요.', 'ok');
    } catch (e) {
      console.error(e);
      TT.toast('엑셀 만들기 실패: ' + e.message, 'err');
    } finally {
      busy = false;
      TT.render();
    }
  }

  /** 공통 안내 문구 입력 (9·10단계에서 같이 씀)
   *  key: state의 항목 이름, def: 기본 문구('' 이면 되돌리기 버튼 없음) */
  TT.noticeCard = (state, { key, title, desc, def = '', placeholder }) => {
    const save = (v) => up((s) => (s[key] = v));
    return h('div.card',
      h('div.card-head',
        h('div', h('h3', title),
          h('p.muted', `${desc} 줄을 바꾸면 인쇄물에서도 줄이 바뀝니다. 비워 두면 안내 문구를 넣지 않습니다.`)),
        def && state[key] !== def ? h('button.btn.ghost', { onclick: () => save(def) }, '기본 문구로 되돌리기') : null),
      h('textarea.notice-input', {
        id: 'notice-' + key, rows: 5, placeholder,
        value: state[key] ?? '',
        onchange: (e) => save(e.target.value),
      }),
      h('p.muted', '입력 칸 밖을 누르면 저장되고 미리 보기에 반영됩니다.'));
  };
  TT.STUDENT_NOTICE = {
    key: 'studentNotice', title: '학생별 시간표 안내 문구', desc: '모든 학생의 시간표 아래에 똑같이 들어갑니다.',
    def: TT.DEFAULT_NOTICE, placeholder: '예) ★ 시험 시작 5분 전까지 입실합니다.',
  };
  TT.ROOM_NOTICE = {
    key: 'roomNotice', title: '고사실 시간표 안내 문구', desc: '모든 고사실 시간표 아래에 똑같이 들어갑니다.',
    placeholder: '예) ★ 시험 시작 10분 전 답안지 배부\n★ 감독교사는 시험 종료 후 답안지를 학번순으로 정리하여 제출',
  };

  function render(state, idx) {
    const pl = TT.placeAll(state, idx);
    if (!pl.slots.length) return h('div.card', h('p', '먼저 6단계에서 시간표를 작성하세요.'));
    const chosen = state.exportSheets || TT.EXCEL_SHEETS.map((s) => s.id);
    const toggle = (id, on) => up((s) => {
      const cur = new Set(s.exportSheets || TT.EXCEL_SHEETS.map((x) => x.id));
      if (on) cur.add(id); else cur.delete(id);
      s.exportSheets = TT.EXCEL_SHEETS.map((x) => x.id).filter((x) => cur.has(x));
    });
    const missingDates = state.days.some((d) => !d.date && pl.slots.some((s) => s.dayId === d.id));

    return h('div.stack',
      h('div.card',
        h('div.card-head', h('h3', '엑셀 파일 만들기'),
          h('button.btn.primary', { disabled: busy || !chosen.length, onclick: () => exportExcel(state, idx, pl, chosen) }, busy ? '만드는 중…' : `엑셀 다운로드 (${chosen.length}개 시트)`)),
        pl.errors.length ? h('div.alert.warn', `배치 확인 사항 ${pl.errors.length}건이 있습니다 (7단계). 엑셀의 [배치확인] 시트에도 기록됩니다. `, h('a.link', { onclick: () => TT.go(7) }, '7단계로')) : null,
        missingDates ? h('div.alert.warn', '시험 날짜가 비어 있는 일차가 있습니다. 2단계에서 날짜를 입력하면 인쇄물에 날짜가 표시됩니다.') : null,
        h('div.sheet-list', TT.EXCEL_SHEETS.map((s) => h('label.pick' + (chosen.includes(s.id) ? '.on' : ''),
          h('input', { type: 'checkbox', checked: chosen.includes(s.id), onchange: (e) => toggle(s.id, e.target.checked) }),
          h('span.pick-name', s.name),
          h('span.pick-meta', s.desc)))),
        h('p.muted', '모든 시트는 A4 인쇄에 맞춰져 있고, 고사실·반·학생마다 페이지가 나뉩니다. 엑셀에서 열어 바로 인쇄하거나 수정할 수 있습니다.')),
      chosen.includes('rooms') ? TT.noticeCard(state, TT.ROOM_NOTICE) : null,
      chosen.includes('student') ? TT.noticeCard(state, TT.STUDENT_NOTICE) : null,
      previewCard(state, idx, pl));
  }

  TT.registerStep({ n: 9, title: '엑셀 출력', desc: '시간표·명렬표·좌석배치도 등 인쇄물을 엑셀 파일로 만듭니다.', render, status: () => null });
})(window);
