/* 8단계: 응시 현황 · 좌석 — 좌석 순서와 배치도 미리보기 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;
  let selKey = null;
  let selRoom = null;

  function seatGrid(state, idx, x) {
    const { cols, rows } = TT.seatLayout(state, x.students.length, x.room);
    const grid = h('div.seat-grid', { style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
    for (let i = 0; i < rows; i++) {
      for (let c = 0; c < cols; c++) {
        const s = x.students[c * rows + i];
        const st = s && idx.studentById.get(s.id);
        grid.appendChild(s
          ? h('div.seat', h('b', s.seat), h('div', st.name), h('small', s.id + (s.subject && x.sections.length > 1 ? ' · ' + TT.shortName(s.subject) : '')))
          : h('div.seat.empty', h('b', c * rows + i + 1), h('small', '빈 자리')));
      }
    }
    return h('div.seat-wrap', h('div.podium', '교 탁'), grid);
  }

  /** 좌석 모양 고르기: [5열×7석] [6열×5석] [6열×6석] [직접 ▢열 × ▢석] */
  function layoutPicker(cols, rows, onPick, extra) {
    const isPreset = TT.SEAT_PRESETS.some(([c, r]) => c === cols && r === rows);
    return h('div.layout-picker',
      extra,
      TT.SEAT_PRESETS.map(([c, r]) => h('button.chip' + (c === cols && r === rows ? '.on' : ''), { onclick: () => onPick(c, r) }, `${c}열 × ${r}석`)),
      h('span.custom' + (isPreset ? '' : '.on'),
        h('span.muted', '직접'),
        h('input', { type: 'number', min: 1, max: 12, value: cols, onchange: (e) => onPick(Math.max(1, Math.min(12, +e.target.value || cols)), rows) }),
        h('span', '열 ×'),
        h('input', { type: 'number', min: 1, max: 15, value: rows, onchange: (e) => onPick(cols, Math.max(1, Math.min(15, +e.target.value || rows))) }),
        h('span', `석 = ${cols * rows}석`)));
  }

  function render(state, idx) {
    const pl = TT.placeAll(state, idx);
    if (!pl.slots.length) return h('div.card', h('p', '먼저 6단계에서 시간표를 작성하세요.'));
    if (!pl.slots.some((s) => s.key === selKey)) selKey = pl.slots[0].key;
    const sl = pl.slots.find((s) => s.key === selKey);
    const used = sl.rooms.filter((x) => x.kind !== 'empty');
    if (!used.some((x) => x.room.id === selRoom)) selRoom = used[0]?.room.id;
    const x = used.find((y) => y.room.id === selRoom);
    const pname = (id) => state.periods.find((p) => p.id === id).name;

    const settings = h('div.card',
      h('h3', '좌석 번호'),
      h('div.rule-row',
        h('label.rule', h('span', '시험실 좌석 순서'),
          h('select', { onchange: (e) => up((s) => (s.seatMode = e.target.value)) },
            h('option', { value: 'id', selected: state.seatMode !== 'random' }, '학번순'),
            h('option', { value: 'random', selected: state.seatMode === 'random' }, '무작위'))),
        state.seatMode === 'random' ? h('button.btn', { onclick: () => up((s) => (s.seatSeed = (s.seatSeed || 1) + 1)) }, '다시 섞기') : null,
        h('span.muted', '1번은 교탁에서 볼 때 왼쪽 첫째 열 맨 앞, 열마다 앞→뒤 순서입니다. 인원이 좌석보다 많으면 뒤로 줄이 늘어납니다. 자습실은 항상 학번순입니다.')));

    const custom = state.rooms.filter((r) => r.seatCols && r.seatRows);
    const layoutCard = h('div.card',
      h('div.card-head', h('h3', '좌석 모양 — 모든 고사실 기본'), h('span.muted', '기본 5열 × 7석')),
      layoutPicker(state.seatCols || 5, state.seatRows || 7, (c, r) => up((s) => { s.seatCols = c; s.seatRows = r; })),
      custom.length ? h('p.muted', '따로 정한 고사실: ', custom.map((r) => `${r.name}(${r.seatCols}×${r.seatRows})`).join(', ')) : null);

    const pickers = h('div.rule-row',
      h('select', { onchange: (e) => { selKey = e.target.value; TT.render(); } },
        pl.slots.map((s) => h('option', { value: s.key, selected: s.key === selKey }, `${TT.dayLabel(state, s.dayId)} ${pname(s.periodId)} · ${s.subjects.map(TT.shortName).join(', ')}`))),
      h('div.chips', used.map((y) => h('button.chip' + (y.room.id === selRoom ? '.on' : ''), { onclick: () => { selRoom = y.room.id; TT.render(); } },
        y.room.name, h('small', ` ${y.kind === 'wait' ? '자습' : y.kind === 'conv' ? '편의' : ''} ${y.students.length}`)))));

    const lay = x && TT.seatLayout(state, x.students.length, x.room);
    const setRoomLayout = (c, r) => up((s) => {
      const room = s.rooms.find((y) => y.id === x.room.id);
      if (c == null) { delete room.seatCols; delete room.seatRows; } else { room.seatCols = c; room.seatRows = r; }
    });
    const preview = x ? h('div.card',
      h('div.card-head', h('h3', `${x.room.name} — ${x.kind === 'wait' ? '자습실' : x.kind === 'conv' ? '편의반' : x.sections.map((q) => `${TT.shortName(q.subject)} ${q.label}`).join(', ')}`),
        h('span.muted', `${x.students.length}명 / 최대 ${x.room.cap}명`)),
      h('div.room-layout',
        h('strong', `${x.room.name} 좌석 모양`),
        layoutPicker(lay.cols, x.room.seatRows || state.seatRows || 7, (c, r) => setRoomLayout(c, r),
          h('button.chip' + (lay.own ? '' : '.on'), { onclick: () => setRoomLayout(null) }, '기본 따름')),
        lay.rows > (x.room.seatRows || state.seatRows || 7) ? h('span.text-warn', `인원이 많아 ${lay.rows}석까지 줄을 늘렸습니다.`) : null),
      seatGrid(state, idx, x)) : null;

    return h('div.stack', settings, layoutCard, h('div.card', pickers), preview);
  }

  TT.registerStep({ n: 8, title: '좌석', desc: '고사실별 좌석 번호 순서를 정하고 배치도를 확인합니다.', render, status: () => null });
})(window);
