/* 엑셀 출력 (ExcelJS) — 화면과 무관, node에서도 동작
 * TT.EXCEL_SHEETS 순서대로 시트를 만든다. 시트를 추가하려면 { id, name, build(ws, ctx) } 를 넣으면 된다.
 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  const FONT = '맑은 고딕';
  const C = { head: 'FFE8EDFB', title: 'FF1E3A8A', wait: 'FFF3F4F6', conv: 'FFFFF4E5', line: 'FF9CA3AF', err: 'FFFDECEC' };
  const thin = { style: 'thin', color: { argb: C.line } };
  const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

  /* ---------- 공용 도우미 ---------- */
  function setup(ws, { landscape = false, cols = [] } = {}) {
    ws.pageSetup = {
      paperSize: 9, orientation: landscape ? 'landscape' : 'portrait',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    };
    ws.properties.defaultRowHeight = 18;
    cols.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  }
  function cell(ws, r, c, value, style = {}) {
    const x = ws.getCell(r, c);
    x.value = value;
    x.font = { name: FONT, size: style.size || 10, bold: !!style.bold, color: style.color ? { argb: style.color } : undefined };
    x.alignment = { vertical: 'middle', horizontal: style.align || 'center', wrapText: true };
    if (style.border !== false) x.border = BORDER;
    if (style.fill) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
    return x;
  }
  function title(ws, r, text, span, sub) {
    ws.mergeCells(r, 1, r, span);
    cell(ws, r, 1, text, { size: 15, bold: true, border: false, color: C.title });
    ws.getRow(r).height = 30;
    if (sub) {
      ws.mergeCells(r + 1, 1, r + 1, span);
      cell(ws, r + 1, 1, sub, { size: 10, border: false, align: 'right', color: 'FF4B5563' });
      return r + 3;
    }
    return r + 2;
  }
  const head = (ws, r, values, c0 = 1) => values.forEach((v, i) => cell(ws, r, c0 + i, v, { bold: true, fill: C.head }));
  const pageBreak = (ws, r) => ws.getRow(r).addPageBreak();
  const short = (s) => (s ? TT.shortName(s) : '');

  /* ---------- 컨텍스트 ---------- */
  function context(state, idx, pl) {
    const m = state.meta;
    const examTitle = `${m.year}학년도 ${m.grade}학년 ${m.semester}학기 ${m.examName}`.replace(/\s+/g, ' ').trim();
    const period = (id) => state.periods.find((p) => p.id === id);
    const slotTitle = (sl) => `${TT.dayLabel(state, sl.dayId)} ${period(sl.periodId).name}`;
    const usageText = (x) => {
      if (x.kind === 'exam') return [...new Set(x.sections.map((s) => short(s.subject)))].join('\n');
      if (x.kind === 'wait') return '자습';
      if (x.kind === 'conv') return '편의반';
      return '';
    };
    return { state, idx, pl, examTitle, period, slotTitle, usageText };
  }

  /* ---------- 1. 전체 시간표 ---------- */
  function sheetOverview(ws, ctx) {
    const { state, pl } = ctx;
    const rooms = state.rooms;
    const span = 3 + rooms.length;
    setup(ws, { landscape: true, cols: [14, 8, 12, ...rooms.map(() => 11), 10] });
    let r = title(ws, 1, `${ctx.examTitle} 시험 시간표`, span + 1);
    head(ws, r, ['날짜', '교시', '시간', ...rooms.map((x) => x.name), '계']);
    r++;
    for (const d of state.days) {
      const daySlots = pl.slots.filter((s) => s.dayId === d.id);
      if (!daySlots.length) continue;
      const r0 = r;
      for (const sl of daySlots) {
        const p = ctx.period(sl.periodId);
        cell(ws, r, 2, p.name, { bold: true });
        cell(ws, r + 1, 2, '인원', { color: 'FF6B7280' });
        ws.mergeCells(r, 3, r + 1, 3);
        cell(ws, r, 3, p.time);
        sl.rooms.forEach((x, i) => {
          const fill = x.kind === 'wait' ? C.wait : x.kind === 'conv' ? C.conv : undefined;
          cell(ws, r, 4 + i, ctx.usageText(x) || '·', { bold: x.kind === 'exam', fill });
          cell(ws, r + 1, 4 + i, x.students.length || '', { fill });
        });
        cell(ws, r, 4 + rooms.length, `응시 ${sl.takers}\n자습 ${sl.waiting}`, { size: 9 });
        cell(ws, r + 1, 4 + rooms.length, sl.takers + sl.waiting);
        ws.getRow(r).height = 34;
        r += 2;
      }
      ws.mergeCells(r0, 1, r - 1, 1);
      cell(ws, r0, 1, TT.dayLabel(state, d.id).replace(' · ', '\n'), { bold: true });
    }
    r++;
    ws.mergeCells(r, 1, r, span + 1);
    cell(ws, r, 1, '자습: 그 교시에 시험이 없는 학생이 자습하는 교실   ·   편의반: 별도 고사실', { border: false, align: 'left', size: 9, color: 'FF6B7280' });
  }

  /* ---------- 2. 고사실별 시간표 ---------- */
  function sheetRoomTimetable(ws, ctx) {
    const { state, pl } = ctx;
    const days = state.days.filter((d) => pl.slots.some((s) => s.dayId === d.id));
    setup(ws, { cols: [12, ...days.map(() => 20)] });
    let r = 1;
    state.rooms.forEach((room, ri) => {
      r = title(ws, r, `고사실 시간표 — ${room.name}`, days.length + 1, ctx.examTitle);
      head(ws, r, ['교시', ...days.map((d) => TT.dayLabel(state, d.id))]);
      r++;
      for (const p of state.periods) {
        if (!pl.slots.some((s) => s.periodId === p.id)) continue;
        cell(ws, r, 1, `${p.name}\n${p.time || ''}`, { bold: true });
        days.forEach((d, i) => {
          const sl = pl.slots.find((s) => s.dayId === d.id && s.periodId === p.id);
          const x = sl?.rooms.find((y) => y.room.id === room.id);
          const text = !sl ? '' : x.kind === 'empty' ? '·' : `${ctx.usageText(x)}\n${x.students.length}명`;
          cell(ws, r, 2 + i, text, { fill: x?.kind === 'wait' ? C.wait : x?.kind === 'conv' ? C.conv : undefined, bold: x?.kind === 'exam' });
        });
        ws.getRow(r).height = 46;
        r++;
      }
      if (ri < state.rooms.length - 1) { pageBreak(ws, r); r += 1; }
    });
  }

  /* ---------- 3. 고사실 명렬표 (시험실 · 자습실) ---------- */
  function sheetRoster(ws, ctx) {
    const { idx, pl } = ctx;
    setup(ws, { cols: [8, 10, 12, 18, 12, 16] });
    let r = 1;
    const blocks = pl.slots.flatMap((sl) => sl.rooms.filter((x) => x.students.length).map((x) => ({ sl, x })));
    blocks.forEach(({ sl, x }, bi) => {
      const kind = x.kind === 'wait' ? '자습실' : x.kind === 'conv' ? '편의반' : '고사실';
      r = title(ws, r, `${kind} 명렬표 — ${x.room.name}`, 6, ctx.examTitle);
      ws.mergeCells(r, 1, r, 6);
      const subj = x.kind === 'exam' ? x.sections.map((s) => `${short(s.subject)}(${s.label} ${s.count}명)`).join(', ') : x.kind === 'wait' ? '자습(미응시)' : '편의반 응시';
      cell(ws, r, 1, `${ctx.slotTitle(sl)}  ${ctx.period(sl.periodId).time || ''}   |   ${subj}   |   ${x.students.length}명 / 최대 ${x.room.cap}명`, { bold: true, align: 'left', fill: x.kind === 'wait' ? C.wait : C.head });
      ws.getRow(r).height = 24;
      r++;
      head(ws, r, ['좌석', '학번', '성명', '과목', '분반', '확인']);
      r++;
      for (const s of x.students) {
        const st = idx.studentById.get(s.id);
        const sec = s.subject ? idx.studentSection.get(s.id + '|' + s.subject) : null;
        cell(ws, r, 1, s.seat);
        cell(ws, r, 2, s.id);
        cell(ws, r, 3, st.name);
        cell(ws, r, 4, s.subject ? short(s.subject) : '자습');
        cell(ws, r, 5, sec ? TT.sectionLabel(sec) : `${st.cls}반`);
        cell(ws, r, 6, '');
        r++;
      }
      r++;
      ws.mergeCells(r, 4, r, 6);
      cell(ws, r, 4, '감독교사:                         (인)', { border: false, align: 'right' });
      r++;
      if (bi < blocks.length - 1) { pageBreak(ws, r); r++; }
    });
  }

  /* ---------- 4. 좌석배치도 ---------- */
  function sheetSeats(ws, ctx) {
    const { state, idx, pl } = ctx;
    const blocks = pl.slots.flatMap((sl) => sl.rooms.filter((x) => x.kind === 'exam' || x.kind === 'conv').map((x) => ({ sl, x })));
    const maxCols = Math.max(1, ...blocks.map(({ x }) => TT.seatLayout(state, x.students.length, x.room).cols));
    setup(ws, { landscape: false, cols: Array(maxCols).fill(maxCols > 6 ? 15 : 18) });
    let r = 1;
    blocks.forEach(({ sl, x }, bi) => {
      const { cols, rows } = TT.seatLayout(state, x.students.length, x.room);
      const off = Math.floor((maxCols - cols) / 2); // 열이 적은 방은 가운데 정렬
      r = title(ws, r, `좌석배치도 — ${x.room.name}`, maxCols, ctx.examTitle);
      ws.mergeCells(r, 1, r, maxCols);
      cell(ws, r, 1, `${ctx.slotTitle(sl)}   |   ${ctx.usageText(x).replace(/\n/g, ', ')}   |   ${x.students.length}명   |   ${cols}열 × ${rows}석`, { bold: true, fill: C.head, align: 'left' });
      r += 2;
      // 교탁: 가운데 (홀수 열이면 가운데 1칸, 짝수면 가운데 2칸)
      const c0 = off + (cols % 2 ? (cols + 1) / 2 : cols / 2);
      const c1 = cols % 2 ? c0 : c0 + 1;
      if (c1 > c0) ws.mergeCells(r, c0, r, c1);
      cell(ws, r, c0, '교  탁', { bold: true, fill: C.wait });
      r += 2;
      // 1번부터 첫째 열(왼쪽) 앞→뒤로, 다음 열 순서. 빈 자리는 번호만 흐리게
      for (let i = 0; i < rows; i++) {
        for (let c = 0; c < cols; c++) {
          const p = c * rows + i;
          const s = x.students[p];
          const st = s && idx.studentById.get(s.id);
          if (s) cell(ws, r + i, off + c + 1, `${s.seat}\n${s.id} ${st.name}` + (s.subject && x.sections.length > 1 ? `\n${short(s.subject)}` : ''), { size: 10 });
          else cell(ws, r + i, off + c + 1, `${p + 1}\n(빈 자리)`, { size: 9, color: 'FFB0B7C3' });
        }
        ws.getRow(r + i).height = 44;
      }
      r += rows + 1;
      if (bi < blocks.length - 1) { pageBreak(ws, r); r++; }
    });
  }

  /* ---------- 5. 학급별 응시현황 ---------- */
  function sheetByClass(ws, ctx) {
    const { state, idx, pl } = ctx;
    const n = pl.slots.length;
    setup(ws, { landscape: true, cols: [6, 10, ...pl.slots.map(() => 13)] });
    const classes = [...new Set(idx.active.map((s) => s.cls))].sort((a, b) => a - b);
    let r = 1;
    classes.forEach((cls, ci) => {
      r = title(ws, r, `${state.meta.grade}학년 ${cls}반 응시 현황`, n + 2, ctx.examTitle);
      head(ws, r, ['번호', '성명', ...pl.slots.map((sl) => `${TT.dayLabel(state, sl.dayId, { short: true }) || ''}\n${ctx.period(sl.periodId).name}`)]);
      ws.getRow(r).height = 32;
      r++;
      for (const st of idx.active.filter((s) => s.cls === cls)) {
        cell(ws, r, 1, st.no);
        cell(ws, r, 2, st.name);
        const map = pl.byStudent.get(st.id);
        pl.slots.forEach((sl, i) => {
          const a = map[sl.key];
          const text = !a ? '' : a.kind === 'wait' ? `자습 ${a.roomName}` : `${short(a.subject)}\n${a.roomName} · ${a.seat}번`;
          cell(ws, r, 3 + i, text, { size: 9, fill: a?.kind === 'wait' ? C.wait : undefined });
        });
        ws.getRow(r).height = 30;
        r++;
      }
      if (ci < classes.length - 1) { pageBreak(ws, r); r++; }
    });
  }

  /* ---------- 6. 학생별 시간표 (학생 1명 = A4 1장) ---------- */
  function sheetByStudent(ws, ctx) {
    const { state, idx, pl } = ctx;
    const days = state.days.filter((d) => pl.slots.some((s) => s.dayId === d.id));
    const periods = state.periods.filter((p) => pl.slots.some((s) => s.periodId === p.id));
    const ncol = Math.max(4, periods.length + 1);
    setup(ws, { cols: [18, ...Array(ncol - 1).fill(Math.round(74 / (ncol - 1)))] });
    ws.pageSetup.fitToHeight = 0;
    const full = (r, text, style) => { ws.mergeCells(r, 1, r, ncol); return cell(ws, r, 1, text, style); };
    const periodSpan = (i) => [2 + i, i === periods.length - 1 ? ncol : 2 + i]; // 마지막 교시가 남는 열을 채움
    const slotOrder = new Map(pl.slots.map((s, i) => [s.key, i]));

    idx.active.forEach((st, si) => {
      const map = pl.byStudent.get(st.id);
      let r = si === 0 ? 1 : ws.rowCount + 1;

      // 제목 · 학생 정보
      full(r, '개인 시험 시간표', { size: 18, bold: true, border: false, color: C.title });
      ws.getRow(r).height = 36;
      full(r + 1, ctx.examTitle, { size: 11, border: false, color: 'FF4B5563' });
      r += 3;
      full(r, `${state.meta.grade}학년 ${st.cls}반 ${st.no}번     ${st.name}     (학번 ${st.id})`, { size: 14, bold: true, fill: C.head });
      ws.getRow(r).height = 34;
      r += 2;

      // 일자별 시간표
      full(r, '■ 일자별 시간표', { bold: true, border: false, align: 'left', size: 11 });
      r++;
      cell(ws, r, 1, '일자', { bold: true, fill: C.head });
      periods.forEach((p, i) => {
        const [c0, c1] = periodSpan(i);
        if (c1 > c0) ws.mergeCells(r, c0, r, c1);
        cell(ws, r, c0, `${p.name}\n${p.time || ''}`, { bold: true, fill: C.head });
      });
      ws.getRow(r).height = 32;
      r++;
      for (const d of days) {
        cell(ws, r, 1, TT.dayLabel(state, d.id).replace(' · ', '\n'), { bold: true });
        periods.forEach((p, i) => {
          const [c0, c1] = periodSpan(i);
          if (c1 > c0) ws.mergeCells(r, c0, r, c1);
          const key = TT.slotKey(d.id, p.id);
          const a = map[key];
          const has = slotOrder.has(key);
          const text = !has ? '' : !a ? '-' : a.kind === 'wait' ? `자습\n${a.roomName}` : `${short(a.subject)}\n${a.roomName} · ${a.seat}번`;
          cell(ws, r, c0, text, { size: a && a.kind !== 'wait' ? 11 : 10, bold: a && a.kind !== 'wait', fill: a?.kind === 'wait' ? C.wait : undefined, color: a?.kind === 'wait' ? 'FF6B7280' : undefined });
        });
        ws.getRow(r).height = 52;
        r++;
      }
      r++;

      // 응시 과목 목록 (시간순)
      const exams = Object.entries(map).filter(([, a]) => a.kind !== 'wait').sort((x, y) => slotOrder.get(x[0]) - slotOrder.get(y[0]));
      full(r, `■ 응시 과목 (${exams.length}과목)`, { bold: true, border: false, align: 'left', size: 11 });
      r++;
      const listHead = ['일자', '교시 · 시간', '과목', '고사실 · 좌석'];
      listHead.forEach((v, i) => {
        const c1 = i === 3 ? ncol : i + 1;
        if (c1 > i + 1) ws.mergeCells(r, i + 1, r, c1);
        cell(ws, r, i + 1, v, { bold: true, fill: C.head });
      });
      r++;
      for (const [key, a] of exams) {
        const sl = pl.slots[slotOrder.get(key)];
        const p = ctx.period(sl.periodId);
        const vals = [TT.dayLabel(state, sl.dayId), `${p.name}  ${p.time || ''}`, short(a.subject), `${a.roomName}  ·  ${a.seat}번`];
        vals.forEach((v, i) => {
          const c1 = i === 3 ? ncol : i + 1;
          if (c1 > i + 1) ws.mergeCells(r, i + 1, r, c1);
          cell(ws, r, i + 1, v, { bold: i >= 2, size: 10.5 });
        });
        ws.getRow(r).height = 24;
        r++;
      }
      r++;

      // 자습
      const waits = Object.entries(map).filter(([, a]) => a.kind === 'wait').sort((x, y) => slotOrder.get(x[0]) - slotOrder.get(y[0]));
      if (waits.length) {
        full(r, '■ 자습 (시험이 없는 교시)', { bold: true, border: false, align: 'left', size: 11 });
        r++;
        const text = waits.map(([key, a]) => {
          const sl = pl.slots[slotOrder.get(key)];
          return `${TT.dayLabel(state, sl.dayId, { short: true })} ${ctx.period(sl.periodId).name} → ${a.roomName}`;
        }).join('     ');
        full(r, text, { align: 'left', size: 10, fill: C.wait });
        ws.getRow(r).height = Math.max(24, 16 * Math.ceil(waits.length / 4));
        r += 2;
      }

      full(r, '※ 시험 시작 10분 전까지 지정된 고사실의 좌석에 앉으세요. 자습 시간에는 지정된 자습실에서 자습합니다.', { border: false, align: 'left', size: 9.5, color: 'FF6B7280' });
      if (si < idx.active.length - 1) pageBreak(ws, r);
    });
  }

  /* ---------- 7. 문제지 봉투 라벨 ---------- */
  function sheetLabels(ws, ctx) {
    const { state, pl } = ctx;
    setup(ws, { landscape: true, cols: [6, 16, 8, 14, 18, 10, 20, 8] });
    let r = title(ws, 1, '문제지 봉투 라벨 데이터', 8, ctx.examTitle);
    head(ws, r, ['연번', '일자', '교시', '시간', '과목', '고사실', '응시 분반', '인원']);
    r++;
    let n = 1;
    for (const sl of pl.slots) {
      for (const x of sl.rooms) {
        if (x.kind !== 'exam' && x.kind !== 'conv') continue;
        const groups = x.kind === 'conv'
          ? [...new Set(x.students.map((s) => s.subject))].map((sub) => ({ subject: sub, label: '편의반', count: x.students.filter((s) => s.subject === sub).length }))
          : x.sections;
        for (const g of groups) {
          [n++, TT.dayLabel(state, sl.dayId), ctx.period(sl.periodId).name, ctx.period(sl.periodId).time || '', short(g.subject), x.room.name, g.label, g.count]
            .forEach((v, i) => cell(ws, r, i + 1, v));
          r++;
        }
      }
    }
  }

  /* ---------- 8. 배치 오류 ---------- */
  function sheetErrors(ws, ctx) {
    const { pl, state } = ctx;
    setup(ws, { cols: [22, 14, 70] });
    let r = title(ws, 1, '배치 확인 사항', 3);
    head(ws, r, ['교시', '구분', '내용']);
    r++;
    if (!pl.errors.length) cell(ws, r, 1, '오류 없음');
    for (const e of pl.errors) {
      const sl = pl.slots.find((s) => s.key === e.key);
      [ctx.slotTitle(sl), e.code, e.text].forEach((v, i) => cell(ws, r, i + 1, v, { fill: C.err, align: i === 2 ? 'left' : 'center' }));
      r++;
    }
    void state;
  }

  TT.EXCEL_SHEETS = [
    { id: 'overview', name: '전체시간표', desc: '일자·교시 × 고사실 한눈에 보기', build: sheetOverview },
    { id: 'rooms', name: '고사실별시간표', desc: '고사실마다 한 장 (문에 붙이는 용)', build: sheetRoomTimetable },
    { id: 'roster', name: '명렬표', desc: '교시·고사실별 명단 (자습실 포함, 감독 확인란)', build: sheetRoster },
    { id: 'seats', name: '좌석배치도', desc: '교시·고사실별 좌석 (교탁 기준)', build: sheetSeats },
    { id: 'class', name: '학급별응시현황', desc: '반마다 한 장, 학생별 교시·고사실·좌석', build: sheetByClass },
    { id: 'student', name: '학생별시간표', desc: '학생 1명당 A4 1장 (나눠주기용)', build: sheetByStudent },
    { id: 'labels', name: '봉투라벨', desc: '문제지 봉투 라벨용 데이터', build: sheetLabels },
    { id: 'errors', name: '배치확인', desc: '정원 초과·미배치 등 확인 사항', build: sheetErrors },
  ];

  /** @returns ExcelJS.Workbook */
  TT.buildWorkbook = (state, idx, pl, sheetIds, ExcelJS) => {
    ExcelJS = ExcelJS || root.ExcelJS;
    const wb = new ExcelJS.Workbook();
    wb.creator = '시험 시간표';
    wb.created = new Date();
    const ctx = context(state, idx, pl);
    for (const sh of TT.EXCEL_SHEETS) {
      if (sheetIds && !sheetIds.includes(sh.id)) continue;
      sh.build(wb.addWorksheet(sh.name), ctx);
    }
    return wb;
  };
})(typeof window !== 'undefined' ? window : globalThis);
