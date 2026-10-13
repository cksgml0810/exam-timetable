/* 7단계: 학생 배치 — 교시별 시험 분반 → 고사실, 미응시 학생 → 자습실 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;
  let selKey = null;

  const KIND = { exam: ['시험', 'k-exam'], wait: ['자습', 'k-wait'], conv: ['편의반', 'k-conv'], empty: ['비어 있음', 'k-empty'] };

  function slotTitle(state, sl) {
    const p = state.periods.find((x) => x.id === sl.periodId);
    return `${TT.dayLabel(state, sl.dayId)} ${p.name}`;
  }

  const setCap = (roomId, cap) => up((s) => {
    const r = s.rooms.find((y) => y.id === roomId);
    if (r) r.cap = Math.max(1, cap | 0);
  });
  const setOverride = (key, secId, roomId) => up((s) => {
    s.placement = s.placement || {};
    const m = { ...(s.placement[key] || {}) };
    if (roomId) m[secId] = roomId; else delete m[secId];
    s.placement[key] = m;
  });
  const setSplit = (key, secId, roomId, count) => up((s) => {
    s.splits = s.splits || {};
    const m = { ...(s.splits[key] || {}) };
    if (roomId && count > 0) m[secId] = { roomId, count };
    else delete m[secId];
    s.splits[key] = m;
  });

  /** 방 선택지: 이름(정원) — 현재 쓰임 · 들어가는지 표시 */
  function roomChoices(sl, need, excludeId) {
    return sl.rooms.filter((x) => x.room.type !== 'convenience' && x.room.id !== excludeId).map((x) => {
      const used = x.kind === 'exam' ? x.students.length : 0;
      const fits = used + need <= x.room.cap;
      const usage = x.kind === 'exam' ? `시험 ${used}명` : x.kind === 'wait' ? '자습' : '비어 있음';
      return { id: x.room.id, fits, text: `${fits ? '✓' : '⚠'} ${x.room.name} (${x.room.cap}석 · ${usage})` };
    }).sort((a, b) => b.fits - a.fits);
  }

  /** 정원 초과 방 바로 고치기 */
  function fixBox(state, sl, err) {
    const x = sl.rooms.find((y) => y.room.id === err.roomId);
    const over = err.count - err.cap;
    const actions = [
      h('button.btn', { onclick: () => setCap(err.roomId, err.count) }, `최대 수용을 ${err.count}명으로 늘리기`),
    ];
    if (x.kind === 'exam') {
      const sec = x.sections.slice().sort((a, b) => b.count - a.count)[0];
      const moveSel = h('select', { onchange: (e) => e.target.value && setOverride(sl.key, sec.id, e.target.value) },
        h('option', { value: '' }, `${TT.shortName(sec.subject)} ${sec.label}(${sec.count}명) 통째로 옮기기…`),
        roomChoices(sl, sec.count, err.roomId).map((c) => h('option', { value: c.id }, c.text)));
      const splitSel = h('select', { onchange: (e) => e.target.value && setSplit(sl.key, sec.id, e.target.value, over) },
        h('option', { value: '' }, `넘치는 ${over}명만 다른 방으로…`),
        roomChoices(sl, over, err.roomId).map((c) => h('option', { value: c.id }, c.text)));
      if (sec.part !== 2) actions.push(moveSel, splitSel);
      else actions.push(moveSel);
    } else if (x.kind === 'wait') {
      actions.push(h('span.muted', '또는 3단계에서 자습실을 추가하거나 다른 방의 [자습 사용]을 켜세요.'));
    } else if (x.kind === 'conv') {
      actions.push(h('span.muted', '또는 아래 [편의반 학생]에서 일부 학생을 다른 편의반으로 옮기세요.'));
    }
    return h('div.fix-box',
      h('div', h('strong', `${x.room.name} 정원 초과`), ` ${err.count}명 / 최대 ${err.cap}명 — ${over}명 초과`),
      h('div.btn-row', actions));
  }

  const setRole = (key, roomId, role) => up((s) => {
    s.roomRoles = s.roomRoles || {};
    const m = { ...(s.roomRoles[key] || {}) };
    if (role) m[roomId] = role; else delete m[roomId];
    s.roomRoles[key] = m;
  });

  /** 방 카드 끌어 놓기: 시험실 A를 B에 놓으면 A의 분반 ↔ B의 분반 맞바꾸기 (B가 자습·빈 방이면 A의 분반만 B로 이동) */
  function dropRoom(sl, fromId, toId) {
    if (fromId === toId) return;
    const a = sl.rooms.find((x) => x.room.id === fromId);
    const b = sl.rooms.find((x) => x.room.id === toId);
    if (a.kind !== 'exam' || b.room.type === 'convenience') return;
    up((s) => {
      s.placement = s.placement || {};
      const m = { ...(s.placement[sl.key] || {}) };
      a.sections.filter((q) => q.part !== 2).forEach((q) => (m[q.id] = toId));
      if (b.kind === 'exam') b.sections.filter((q) => q.part !== 2).forEach((q) => (m[q.id] = fromId));
      s.placement[sl.key] = m;
      // 옮겨 간 방이 '자습/사용 안 함'으로 지정돼 있었다면 해제
      if (s.roomRoles?.[sl.key]) { delete s.roomRoles[sl.key][toId]; if (b.kind !== 'exam') delete s.roomRoles[sl.key][fromId]; }
    });
  }

  function roomCard(x, sl, roles) {
    const [kindText, kindCls] = KIND[x.kind];
    const n = x.students.length;
    const over = n > x.room.cap;
    let body;
    if (x.kind === 'exam') body = x.sections.map((s) => h('div.rc-line', h('strong', TT.shortName(s.subject)), h('span.muted', ` ${s.label} · ${s.count}명`)));
    else if (x.kind === 'wait') body = h('div.rc-line', h('span.muted', `${x.students[0].id} ~ ${x.students[n - 1].id}`));
    else if (x.kind === 'conv') body = h('div.rc-line', h('span.muted', [...new Set(x.students.map((s) => TT.shortName(s.subject)))].join(', ')));
    else body = h('div.rc-line', h('span.muted', '사용 안 함'));
    const role = roles[x.room.id] || '';
    const roleSel = x.room.type === 'convenience' ? null : h('select.role', {
      title: '이 교시에 이 방의 용도',
      class: role ? 'set' : '',
      onchange: (e) => setRole(sl.key, x.room.id, e.target.value),
    },
    h('option', { value: '', selected: !role }, '자동'),
    h('option', { value: 'exam', selected: role === 'exam' }, '시험실로'),
    h('option', { value: 'wait', selected: role === 'wait' }, '자습실로'),
    h('option', { value: 'off', selected: role === 'off' }, '사용 안 함'));
    return h('div.room-card.' + kindCls + (over ? '.over' : ''), {
      draggable: x.kind === 'exam' ? 'true' : null,
      ondragstart: (e) => { e.dataTransfer.setData('text/room', x.room.id); e.currentTarget.classList.add('dragging'); },
      ondragend: (e) => e.currentTarget.classList.remove('dragging'),
      ondragover: (e) => { if (x.room.type !== 'convenience') { e.preventDefault(); e.currentTarget.classList.add('drop'); } },
      ondragleave: (e) => e.currentTarget.classList.remove('drop'),
      ondrop: (e) => { e.preventDefault(); const from = e.dataTransfer.getData('text/room'); from && dropRoom(sl, from, x.room.id); },
    },
      h('div.rc-head', h('strong', x.room.name), h('span.kind', kindText)),
      body,
      h('div.cap',
        h('div.cap-bar', h('i', { style: { width: Math.min(100, (100 * n) / x.room.cap) + '%' } })),
        h('span', { class: over ? 'text-err' : 'muted' }, `${n} /`),
        h('input.cap-input', {
          type: 'number', min: 1, value: x.room.cap, title: '최대 수용 인원 (모든 교시에 적용)',
          onchange: (e) => setCap(x.room.id, +e.target.value),
        })),
      roleSel);
  }

  function splitCell(sl, u, sp) {
    const total = u.members.length + (sp ? sp.count : 0);
    const count = h('input.cap-input', {
      type: 'number', min: 0, max: total - 1, value: sp ? sp.count : 0, title: '다른 방으로 보낼 인원 (0 = 나누지 않음)',
      onchange: (e) => {
        const n = Math.max(0, Math.min(total - 1, +e.target.value || 0));
        const target = sp?.roomId || roomChoices(sl, n, u.roomId).find((c) => c.fits)?.id;
        setSplit(sl.key, u.sec.id, n ? target : null, n);
      },
    });
    const room = h('select', { disabled: !sp, onchange: (e) => setSplit(sl.key, u.sec.id, e.target.value, sp.count) },
      roomChoices(sl, sp ? sp.count : 1, u.roomId).map((c) => h('option', { value: c.id, selected: sp?.roomId === c.id }, c.text)));
    return h('div.split-cell', count, h('span.muted', '명 →'), room,
      sp ? h('button.btn.icon-btn', { title: '나누기 해제', onclick: () => setSplit(sl.key, u.sec.id, null, 0) }, '×') : null);
  }

  const setConv = (id, roomId) => up((s) => {
    s.convRoom = { ...(s.convRoom || {}) };
    if (roomId) s.convRoom[id] = roomId; else delete s.convRoom[id];
  });

  /** 편의반 학생 → 편의반 고사실 (모든 교시 공통, 학생별로 옮기기) */
  function convCard(state, idx, pl) {
    const ids = idx.active.filter((s) => state.special[s.id]).map((s) => s.id);
    if (!ids.length) return null;
    const rooms = state.rooms.filter((r) => r.type === 'convenience');
    const head = h('div', h('h3', `편의반 학생 (${ids.length}명)`),
      h('p.muted', '1단계에서 [편의반]으로 표시한 학생입니다. 처음에는 편의반 고사실에 학번순으로 고르게 나누고, 여기서 학생마다 옮길 수 있습니다. 정한 방은 모든 교시에 똑같이 적용됩니다.'));
    if (!rooms.length) {
      return h('div.card', head,
        h('div.alert.warn', '편의반 고사실이 없어 일반 고사실에 배치되어 있습니다. 3단계에서 종류를 [편의반]으로 한 고사실(예: 진로활동실, 통합반)을 추가하세요. ',
          h('a.link', { onclick: () => TT.go(3) }, '3단계로')));
    }
    const conv = TT.convAssign(state, idx);
    const count = new Map(rooms.map((r) => [r.id, 0]));
    conv.forEach((a) => count.set(a.roomId, count.get(a.roomId) + 1));
    const examSlots = (id) => pl.slots.filter((sl) => pl.byStudent.get(id)?.[sl.key]?.kind === 'conv').length;
    const anyManual = ids.some((id) => conv.get(id)?.manual);
    const rows = ids.map((id) => idx.studentById.get(id)).sort((a, b) => a.cls - b.cls || a.no - b.no).map((st) => {
      const a = conv.get(st.id);
      return h('tr',
        h('td', st.id), h('td', st.cls + '반'), h('td', st.no), h('td', st.name),
        h('td.num', examSlots(st.id)),
        h('td', h('select', { onchange: (e) => setConv(st.id, e.target.value) },
          rooms.map((r) => h('option', { value: r.id, selected: r.id === a.roomId }, `${r.name} (${count.get(r.id)}명 / 최대 ${r.cap}명)`)))),
        h('td', a.manual
          ? h('span.btn-row', h('span.badge.warn', '직접 지정'), h('button.btn.icon-btn', { title: '자동 배치로 되돌리기', onclick: () => setConv(st.id, null) }, '×'))
          : h('span.muted', '자동')));
    });
    return h('div.card',
      h('div.card-head', head,
        anyManual ? h('button.btn.ghost', { onclick: () => up((s) => { s.convRoom = {}; }) }, '편의반 자동 배치로 되돌리기') : null),
      h('div.chips', rooms.map((r) => {
        const n = count.get(r.id);
        return h('span.chip' + (n > r.cap ? '.err' : ''), `${r.name} ${n}명 / 최대 ${r.cap}명`);
      })),
      h('table.tbl',
        h('thead', h('tr', h('th', '학번'), h('th', '반'), h('th', '번호'), h('th', '성명'), h('th.num', '응시 교시'), h('th', '편의반 고사실'), h('th', ''))),
        h('tbody', rows)));
  }

  function render(state, idx) {
    const pl = TT.placeAll(state, idx);
    if (!pl.slots.length) {
      return h('div.card', h('p', '먼저 6단계에서 시간표를 작성하세요.'), h('button.btn.primary', { onclick: () => TT.go(6) }, '시간표 작성하기'));
    }
    if (!pl.slots.some((s) => s.key === selKey)) selKey = pl.slots[0].key;
    const sl = pl.slots.find((s) => s.key === selKey);
    const overrides = (state.placement || {})[selKey] || {};

    const settings = h('div.card',
      h('div.card-head',
        h('div', h('h3', '배치 방식'), h('p.muted', '필요한 수만큼 시험실을 고사실 목록 순서(3단계)대로 모아서 정하고, 나머지 방은 자습실로 씁니다. 순서를 바꾸려면 3단계에서 ↑↓로 옮기세요.')),
        pl.errors.length ? TT.badge('err', `확인 필요 ${pl.errors.length}건`) : TT.badge('ok', '오류 없음')),
      h('div.rule-row',
        h('label.rule', h('span', '시험실'),
          h('select', { onchange: (e) => up((s) => (s.roomMode = e.target.value)) },
            h('option', { value: 'cluster', selected: state.roomMode !== 'own' }, '한쪽으로 모으기 (시험실 사이에 자습실 없음)'),
            h('option', { value: 'own', selected: state.roomMode === 'own' }, '분반을 자기 반 교실에 (흩어질 수 있음)'))),
        state.roomMode !== 'own' ? h('label.rule', h('span', '묶음 위치'),
          h('select', { onchange: (e) => up((s) => (s.clusterAt = e.target.value)) },
            h('option', { value: 'front', selected: state.clusterAt !== 'best' }, '앞 번호부터 (예: 2-1~2-7)'),
            h('option', { value: 'best', selected: state.clusterAt === 'best' }, '분반 교실이 가장 많이 들어가는 위치'))) : null),
      h('div.rule-row',
        h('label.rule', h('span', '자습(미응시) 학생'),
          h('select', { onchange: (e) => up((s) => (s.waitMode = e.target.value)) },
            h('option', { value: 'even', selected: state.waitMode !== 'own' }, '학번순으로 자습실에 고르게'),
            h('option', { value: 'own', selected: state.waitMode === 'own' }, '자기 반 교실이 비어 있으면 그대로'))),
        h('span.muted', '자습실로 쓸 방은 3단계에서 [자습 사용]으로 정합니다.')));

    const tabs = h('div.slot-tabs', pl.slots.map((s) => h('button.slot-tab' + (s.key === selKey ? '.on' : ''), {
      onclick: () => { selKey = s.key; TT.render(); },
    },
    h('span.st-title', slotTitle(state, s)),
    h('span.st-sub', s.subjects.map(TT.shortName).join(', ')),
    s.errors.length ? h('span.dot.err') : h('span.dot.ok'))));

    const head = h('div.card-head',
      h('div', h('h3', `${slotTitle(state, sl)} · ${sl.subjects.map(TT.shortName).join(', ')}`),
        h('p.muted', `응시 ${sl.takers}명 · 자습 ${sl.waiting}명 · 시험실 ${sl.rooms.filter((x) => x.kind === 'exam').length} · 자습실 ${sl.rooms.filter((x) => x.kind === 'wait').length}`)),
      Object.keys(overrides).length || Object.keys((state.splits || {})[selKey] || {}).length || Object.keys((state.roomRoles || {})[selKey] || {}).length
        ? h('button.btn.ghost', { onclick: () => up((s) => { delete s.placement[selKey]; if (s.splits) delete s.splits[selKey]; if (s.roomRoles) delete s.roomRoles[selKey]; }) }, '이 교시 자동 배치로 되돌리기') : null);

    const overErrs = sl.errors.filter((e) => e.roomId);
    const otherErrs = sl.errors.filter((e) => !e.roomId);
    const errors = sl.errors.length ? h('div.stack.fixes',
      otherErrs.length ? h('div.alert.err', otherErrs.map((e) => h('div', h('strong', e.code), ' ', e.text))) : null,
      overErrs.map((e) => fixBox(state, sl, e))) : null;
    const splits = (state.splits || {})[selKey] || {};
    const roles = (state.roomRoles || {})[selKey] || {};

    const roomOptions = (secId, cur) => state.rooms.filter((r) => r.type !== 'convenience').map((r) => {
      const x = sl.rooms.find((y) => y.room.id === r.id);
      const usage = x.kind === 'exam' ? x.sections.filter((q) => q.id !== secId).map((q) => `${TT.shortName(q.subject)} ${q.label}`).join('+') : x.kind === 'wait' ? '자습' : '';
      return h('option', { value: r.id, selected: r.id === cur }, `${r.name} (${r.cap}석)${usage ? ' — ' + usage : ''}`);
    });

    const secTable = h('table.tbl',
      h('thead', h('tr', h('th', '과목'), h('th', '분반'), h('th.num', '인원'), h('th', '고사실'), h('th', '일부 다른 방으로 (학번 뒤쪽부터)'), h('th', ''))),
      h('tbody', sl.units.filter((u) => u.part !== 2).map((u) => h('tr',
        h('td', h('strong', TT.shortName(u.subject))),
        h('td', TT.sectionLabel(u.sec)),
        h('td.num', u.members.length),
        h('td', h('select', {
          onchange: (e) => up((s) => {
            s.placement = s.placement || {};
            s.placement[selKey] = { ...(s.placement[selKey] || {}), [u.sec.id]: e.target.value };
          }),
        }, u.roomId ? null : h('option', { value: '', selected: true }, '— 미배치 —'), roomOptions(u.sec.id, u.roomId))),
        h('td', splitCell(sl, u, splits[u.sec.id])),
        h('td', overrides[u.sec.id] || splits[u.sec.id] ? h('span.badge.warn', '직접 지정') : h('span.muted', '자동'))))));

    return h('div.stack', settings, convCard(state, idx, pl), tabs,
      h('div.card', head, errors,
        h('p.muted.drag-hint', '직접 조정: 방 카드의 [자동 ▾]에서 시험실/자습실/사용 안 함을 정하거나, 시험실 카드를 다른 방 카드에 끌어다 놓아 바꾸세요.'),
        h('div.room-grid', sl.rooms.map((x) => roomCard(x, sl, roles))),
        h('h3', '분반별 고사실'),
        h('p.muted', '고사실을 바꾸면 그 방에 있던 다른 분반·자습 학생은 자동으로 다른 방에 다시 배치됩니다. 같은 방을 두 분반에 지정하면 합반됩니다. 일부 인원을 적으면 학번 뒤쪽 학생부터 지정한 방으로 옮깁니다. 방 카드의 숫자 칸에서 최대 수용 인원을 바로 바꿀 수 있습니다(모든 교시 적용).'),
        secTable));
  }

  TT.registerStep({
    n: 7,
    title: '학생 배치',
    desc: '교시마다 시험 분반을 고사실에, 시험이 없는 학생을 자습실에 배치합니다.',
    render,
    status: (s, idx) => {
      if (!idx) return null;
      const pl = TT.placeAll(s, idx);
      if (!pl.slots.length) return { kind: 'todo', text: '시간표 필요' };
      return pl.errors.length ? { kind: 'warn', text: `확인 ${pl.errors.length}건` } : { kind: 'ok', text: '배치 완료' };
    },
  });
})(window);
