/* 3단계: 반과 고사실 — 반·고사실을 자유롭게 추가/삭제/이름 변경 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;
  const up = TT.store.update;

  function classSizes(idx) {
    const m = new Map();
    for (const s of idx.active) m.set(s.cls, (m.get(s.cls) || 0) + 1);
    return m;
  }

  function render(state, idx) {
    const classes = TT.classList(state);
    const sizes = classSizes(idx);
    const dataClasses = new Set(state.data.students.map((s) => s.cls));
    const totalCap = state.rooms.reduce((t, r) => t + (+r.cap || 0), 0);
    const n = idx.active.length;

    const classCard = h('div.card',
      h('div.card-head', h('h3', '반'),
        h('button.btn', {
          onclick: () => {
            const v = parseInt(prompt('추가할 반 번호를 입력하세요 (예: 14)'), 10);
            if (!v || classes.includes(v)) return;
            up((s) => s.extraClasses.push(v));
          },
        }, '+ 반 추가')),
      h('div.chips', classes.map((c) => h('span.chip' + (dataClasses.has(c) ? '' : '.extra'),
        `${c}반`, h('small', sizes.get(c) ? ` ${sizes.get(c)}명` : ' 0명'),
        dataClasses.has(c) ? null : h('button.chip-x', { title: '삭제', onclick: () => up((s) => (s.extraClasses = s.extraClasses.filter((x) => x !== c))) }, '×')))),
      h('p.muted', '데이터에 있는 반은 자동으로 표시됩니다. 추가한 반은 점선으로 표시됩니다.'));

    const clsOptions = (sel) => [h('option', { value: '' }, '— 없음 —'), ...classes.map((c) => h('option', { value: c, selected: +sel === c }, `${c}반`))];

    const roomRows = state.rooms.map((r, i) => {
      const size = r.cls ? sizes.get(+r.cls) || 0 : 0;
      const warn = r.cls && size > r.cap;
      return h('tr',
        h('td.muted', i + 1),
        h('td', h('input', { id: 'rn-' + r.id, value: r.name, onchange: (e) => up((s) => (s.rooms[i].name = e.target.value)), style: { width: '120px' } })),
        h('td', h('select', { onchange: (e) => up((s) => (s.rooms[i].type = e.target.value)) },
          Object.entries(TT.ROOM_TYPES).map(([k, v]) => h('option', { value: k, selected: r.type === k }, v)))),
        h('td', h('select', { onchange: (e) => up((s) => (s.rooms[i].cls = e.target.value ? +e.target.value : null)) }, clsOptions(r.cls))),
        h('td', h('input', { id: 'rc-' + r.id, type: 'number', min: 1, value: r.cap, onchange: (e) => up((s) => (s.rooms[i].cap = +e.target.value || 0)), style: { width: '70px' } })),
        h('td', r.cls ? h('span' + (warn ? '.text-warn' : '.muted'), `${size}명` + (warn ? ' (수용 초과)' : '')) : ''),
        h('td.center', r.type === 'convenience' ? h('span.muted', '-') : h('input', { type: 'checkbox', checked: TT.waitAllowed(r), title: '그 교시에 시험이 없는 학생의 자습실로 사용', onchange: (e) => up((s) => (s.rooms[i].wait = e.target.checked)) })),
        h('td', h('select', {
          onchange: (e) => up((s) => {
            const room = s.rooms[i];
            if (!e.target.value) { delete room.seatCols; delete room.seatRows; return; }
            const [c, rr] = e.target.value.split('x').map(Number);
            room.seatCols = c; room.seatRows = rr;
          }),
        },
        h('option', { value: '', selected: !r.seatCols }, `기본 (${state.seatCols || 5}×${state.seatRows || 7})`),
        [...TT.SEAT_PRESETS, ...(r.seatCols && !TT.SEAT_PRESETS.some(([c, rr]) => c === r.seatCols && rr === r.seatRows) ? [[r.seatCols, r.seatRows]] : [])]
          .map(([c, rr]) => h('option', { value: `${c}x${rr}`, selected: r.seatCols === c && r.seatRows === rr }, `${c}열 × ${rr}석`)))),
        h('td.row-actions',
          h('button.btn.icon-btn', { title: '위로', onclick: () => up((s) => i > 0 && s.rooms.splice(i - 1, 0, s.rooms.splice(i, 1)[0])) }, '↑'),
          h('button.btn.icon-btn', { title: '아래로', onclick: () => up((s) => i < s.rooms.length - 1 && s.rooms.splice(i + 1, 0, s.rooms.splice(i, 1)[0])) }, '↓'),
          h('button.btn.icon-btn.danger', { title: '삭제', onclick: () => up((s) => s.rooms.splice(i, 1)) }, '×')));
    });

    const missing = classes.filter((c) => !state.rooms.some((r) => +r.cls === c && r.type === 'class'));
    const roomCard = h('div.card',
      h('div.card-head', h('h3', `고사실 ${state.rooms.length}개`),
        h('div.btn-row',
          missing.length ? h('button.btn', {
            onclick: () => up((s) => missing.forEach((c) => s.rooms.push({ id: TT.uid('r'), name: s.meta.grade ? `${s.meta.grade}-${c}` : `${c}반`, type: 'class', cls: c, cap: 35 }))),
          }, `반 교실 ${missing.length}개 추가`) : null,
          h('button.btn', { onclick: () => up((s) => s.rooms.push({ id: TT.uid('r'), name: '특별실' + (s.rooms.filter((r) => r.type === 'special').length + 1), type: 'special', cls: null, cap: 40 })) }, '+ 특별실'),
          h('button.btn', { onclick: () => up((s) => s.rooms.push({ id: TT.uid('r'), name: '자습실' + (s.rooms.filter((r) => r.type === 'study').length + 1), type: 'study', cls: null, cap: 40 })) }, '+ 자습실'),
          h('button.btn', { onclick: () => up((s) => s.rooms.push({ id: TT.uid('r'), name: '편의반', type: 'convenience', cls: null, cap: 10 })) }, '+ 편의반'))),
      h('table.tbl',
        h('thead', h('tr', h('th', '#'), h('th', '고사실명'), h('th', '유형'), h('th', '연결 반'), h('th', '최대 수용'), h('th', '반 인원'), h('th.center', '자습 사용'), h('th', '좌석 모양'), h('th', ''))),
        h('tbody', roomRows)),
      h('div.summary-line',
        h('span', `총 수용 ${TT.fmt(totalCap)}석`),
        h('span', `응시 학생 ${TT.fmt(n)}명`),
        totalCap < n ? TT.badge('err', `${n - totalCap}석 부족`) : TT.badge('ok', `여유 ${totalCap - n}석`)),
      h('div.help',
        h('p', h('strong', '학급 교실'), ' — 연결된 반 학생들의 기본 자리(대기·자습)이자 고사실로 쓰입니다.'),
        h('p', h('strong', '특별실'), ' — 시험 보는 학생이 이동해서 응시하는 별도 교실(예: 열정관, 지성관).'),
        h('p', h('strong', '자습실'), ' — 그 교시에 시험이 없는 학생만 모이는 방(도서관·강당 등). 시험실로는 쓰지 않습니다.'),
        h('p', h('strong', '편의반'), ' — 1단계에서 편의반으로 지정한 학생들이 응시하는 고사실.'),
        h('p', h('strong', '자습 사용'), ' — 체크한 방은 시험이 없을 때 자습실로 씁니다. 특별실은 기본으로 꺼져 있습니다.')));

    return h('div.stack', classCard, roomCard);
  }

  TT.registerStep({
    n: 3,
    title: '반 · 고사실',
    desc: '반과 고사실을 필요한 만큼 추가하고, 고사실 이름과 최대 수용 인원을 정합니다.',
    render,
    status: (s, idx) => {
      if (!s.rooms.length) return { kind: 'warn', text: '고사실 없음' };
      const cap = s.rooms.reduce((t, r) => t + (+r.cap || 0), 0);
      return cap >= (idx?.active.length || 0) ? { kind: 'ok', text: '확인' } : { kind: 'warn', text: '수용 인원 부족' };
    },
  });
})(window);
