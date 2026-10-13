/* 10단계: 골라서 인쇄 — 교시·고사실을 하나씩 골라 바로 인쇄 (엑셀 없이)
 * 시트 모양은 9단계 엑셀과 같은 빌더(TT.EXCEL_SHEETS)를 그 교시/고사실만으로 만들어 쓴다.
 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;

  /** by: 'slot' 교시·고사실을 골라서 | 'room' 고사실만 골라서 */
  const KINDS = [
    { id: 'roster', name: '고사실 명렬표', desc: '교시·고사실별 명단 (자습실 포함, 감독 확인란)', by: 'slot' },
    { id: 'seats', name: '좌석배치도', desc: '교시·고사실별 좌석 (교탁 기준)', by: 'slot', examOnly: true },
    { id: 'rooms', name: '고사실 시간표', desc: '고사실마다 한 장 (문에 붙이는 용)', by: 'room' },
  ];
  let kindId = 'roster';
  let slotKey = null;
  let roomId = null;

  const USAGE = { exam: '시험', wait: '자습', conv: '편의반' };

  function build(state, idx, pl, only) {
    return TT.buildWorkbook(state, idx, pl, [kindId], null, only).worksheets[0];
  }

  function print(state, idx, pl, only) {
    try {
      TT.printSheet(build(state, idx, pl, only));
    } catch (e) {
      console.error(e);
      TT.toast('인쇄 준비 실패: ' + e.message, 'err');
    }
  }

  function render(state, idx) {
    const pl = TT.placeAll(state, idx);
    if (!pl.slots.length) return h('div.card', h('p', '먼저 6단계에서 시간표를 작성하세요.'), h('button.btn.primary', { onclick: () => TT.go(6) }, '시간표 작성하기'));
    const kind = KINDS.find((k) => k.id === kindId);
    const period = (id) => state.periods.find((p) => p.id === id);
    const slotTitle = (sl) => `${TT.dayLabel(state, sl.dayId)} ${period(sl.periodId).name}`;

    // 교시 → 그 교시에 쓰는 고사실 / 고사실 → 모든 고사실
    if (!pl.slots.some((s) => s.key === slotKey)) slotKey = pl.slots[0].key;
    const sl = pl.slots.find((s) => s.key === slotKey);
    const used = (x) => x.students.length && (!kind.examOnly || x.kind === 'exam' || x.kind === 'conv');
    const roomList = kind.by === 'slot'
      ? sl.rooms.filter(used).map((x) => ({ id: x.room.id, name: x.room.name, text: `${x.room.name} — ${x.kind === 'exam' ? x.sections.map((q) => TT.shortName(q.subject)).filter((v, i, a) => a.indexOf(v) === i).join(', ') : USAGE[x.kind]} (${x.students.length}명)` }))
      : state.rooms.map((r) => ({ id: r.id, name: r.name, text: r.name }));
    if (!roomList.some((r) => r.id === roomId)) roomId = roomList[0]?.id || null;
    const ri = roomList.findIndex((r) => r.id === roomId);
    const room = roomList[ri];
    const moveRoom = (d) => { roomId = roomList[ri + d].id; TT.render(); };

    // 이 고사실을 쓰는 교시 수 (같은 고사실 모든 교시 인쇄용)
    const roomSlots = kind.by === 'slot' && room
      ? pl.slots.filter((s) => s.rooms.some((x) => x.room.id === room.id && used(x))).length : 0;

    const kindChips = h('div.chips.sheet-tabs', KINDS.map((k) => h('button.chip' + (k.id === kindId ? '.on' : ''), {
      onclick: () => { kindId = k.id; TT.render(); },
    }, k.name)));

    const pick = h('div.print-pick',
      kind.by === 'slot' ? h('label.field', h('span', '일자 · 교시'),
        h('select', { onchange: (e) => { slotKey = e.target.value; TT.render(); } },
          pl.slots.map((s) => h('option', { value: s.key, selected: s.key === slotKey }, `${slotTitle(s)} · ${s.subjects.map(TT.shortName).join(', ')}`)))) : null,
      h('label.field', h('span', '고사실'),
        h('div.room-nav',
          h('button.btn.icon-btn', { title: '이전 고사실', disabled: ri <= 0, onclick: () => moveRoom(-1) }, '‹'),
          h('select', { onchange: (e) => { roomId = e.target.value; TT.render(); } },
            roomList.map((r) => h('option', { value: r.id, selected: r.id === roomId }, r.text))),
          h('button.btn.icon-btn', { title: '다음 고사실', disabled: ri < 0 || ri >= roomList.length - 1, onclick: () => moveRoom(1) }, '›'))));

    const only = kind.by === 'slot' ? { slotKey, roomId } : { roomId };
    const actions = h('div.print-actions',
      h('button.btn.primary', { disabled: !room, onclick: () => print(state, idx, pl, only) }, '🖨 이 장 인쇄'),
      kind.by === 'slot'
        ? [
          h('button.btn', { onclick: () => print(state, idx, pl, { slotKey }) }, `${slotTitle(sl)} 모든 고사실 인쇄 (${sl.rooms.filter(used).length}장)`),
          room ? h('button.btn', { onclick: () => print(state, idx, pl, { roomId }) }, `${room.name} 모든 교시 인쇄 (${roomSlots}장)`) : null,
        ]
        : h('button.btn', { onclick: () => print(state, idx, pl, {}) }, `모든 고사실 인쇄 (${state.rooms.length}장)`));

    let preview;
    if (!room) preview = h('p.muted', kind.examOnly ? '이 교시에는 좌석배치도를 만들 시험실이 없습니다.' : '인쇄할 고사실이 없습니다.');
    else {
      const ws = build(state, idx, pl, only);
      preview = h('div.paper-wrap', TT.sheetPages(ws).map((pg) => TT.renderSheetPage(ws, pg)));
    }

    return h('div.stack',
      h('div.card',
        h('div.card-head', h('div', h('h3', '무엇을 인쇄할까요?'), h('p.muted', kind.desc))),
        kindChips, pick, actions,
        h('p.muted', '인쇄 창이 열리면 프린터를 고르고 [인쇄]를 누르세요. [PDF로 저장]을 고르면 파일로도 남길 수 있습니다. 한꺼번에 엑셀로 받으려면 9단계를 쓰세요.')),
      kind.id === 'rooms' ? TT.noticeCard(state, TT.ROOM_NOTICE) : null,
      h('div.card', h('div.card-head', h('h3', '미리 보기'), room ? h('span.muted', kind.by === 'slot' ? `${slotTitle(sl)} · ${room.name}` : room.name) : null), preview));
  }

  TT.registerStep({ n: 10, title: '골라서 인쇄', desc: '고사실 명렬표·좌석배치도·고사실 시간표를 교시·고사실별로 골라 바로 인쇄합니다.', render, status: () => null });
})(window);
