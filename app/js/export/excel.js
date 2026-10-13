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
      margins: { left: 0.4, right: 0.4, top: 0.3, bottom: 0.3, header: 0.15, footer: 0.15 },
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
  function title(ws, r, text, span, sub, size = 15) {
    ws.mergeCells(r, 1, r, span);
    cell(ws, r, 1, text, { size, bold: true, border: false, color: C.title });
    ws.getRow(r).height = Math.round(size * 2);
    if (sub) {
      ws.mergeCells(r + 1, 1, r + 1, span);
      cell(ws, r + 1, 1, sub, { size: 10, border: false, align: 'right', color: 'FF4B5563' });
      return r + 3;
    }
    return r + 2;
  }
  const head = (ws, r, values, c0 = 1, style = {}) => values.forEach((v, i) => cell(ws, r, c0 + i, v, { bold: true, fill: C.head, ...style }));

  /* 한 장에 꽉 차게: A4 인쇄 영역(위아래 여백 0.3in → 세로 798pt·가로 552pt)보다 조금 작게 — 가로 px, 세로 pt */
  const PAGE = { portrait: { w: 700, h: 780 }, landscape: { w: 1020, h: 536 } };
  /** 열 너비(글자 단위)를 비율대로 나눠 인쇄 폭(px)을 채움. 엑셀 열 너비 1 ≈ 7px (+5px 여백) */
  const fitCols = (px, weights) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    return weights.map((w) => Math.max(2, Math.floor(((px * w) / sum - 5) / 7 * 10) / 10));
  };
  /** r0~r1 행(한 장)이 세로 target(pt)에 꽉 차도록 groups의 행 높이를 정함.
   *  나머지 행 높이를 뺀 공간을 groups 순서대로 나눠 주되, 각 행은 min~max 사이 (빈 행도 높이를 적어 둠)
   *  @returns 그 장의 최종 높이(pt) — min으로도 넘치면 target보다 큼 */
  function fitHeight(ws, r0, r1, target, groups) {
    const inGroup = new Set(groups.flatMap((g) => g.rows));
    let left = target;
    for (let r = r0; r <= r1; r++) {
      const row = ws.getRow(r);
      if (!row.height) row.height = 18;
      if (!inGroup.has(r)) left -= row.height;
    }
    for (const g of groups) left -= g.min * g.rows.length;
    for (const { rows, min, max } of groups) {
      if (!rows.length) continue;
      const add = Math.max(0, Math.min(max - min, left / rows.length));
      rows.forEach((r) => (ws.getRow(r).height = Math.floor(min + add)));
      left -= add * rows.length;
    }
    let total = 0;
    for (let r = r0; r <= r1; r++) total += ws.getRow(r).height;
    return total;
  }
  /** 가장 긴 장(tallest)도 한 장에 들어가게: 넘치면 시트 전체 인쇄 배율을 그만큼 줄임 (엑셀 '너비 맞춤'은 세로로 줄이지 않음) */
  function fitScale(ws, tallest, target) {
    if (tallest <= target) return;
    ws.pageSetup.fitToPage = false;
    ws.pageSetup.scale = Math.max(40, Math.floor((100 * target) / tallest));
  }
  const spacer = (ws, r, h = 10) => (ws.getRow(r).height = h);
  const pageBreak = (ws, r) => ws.getRow(r).addPageBreak();
  /** 글 폭(px) 어림: 한글·한자 1em, 그 밖(숫자·영문·기호) 0.6em, 넉넉히 10% 더 (1pt = 1.333px) */
  const textPx = (line, size) => [...line].reduce((w, ch) => w + (/[\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch) ? 1 : 0.6), 0) * size * 1.333 * 1.15;
  /** 줄바꿈 + 칸 폭(px)에 따른 자동 줄바꿈까지 센 줄 수 */
  const countLines = (text, px, size) =>
    String(text).split('\n').reduce((n, line) => n + Math.max(1, Math.ceil(textPx(line, size) / Math.max(20, px))), 0);
  /** 여러 줄 글이 잘리지 않는 행 높이(pt). 엑셀의 맑은 고딕은 줄 간격이 넓어 한 줄 ≈ 글자 크기 × 1.75, 줄글(안내 등)은 × 2로 넉넉히 */
  const linesHeight = (text, px, size, k = 1.75) => Math.ceil(countLines(text, px, size) * size * k + 6);
  /** 공통 안내 문구: '■ 안내' + 문구(줄바꿈 유지), 잘리지 않게 높이를 넉넉히. 마지막 행 번호를 돌려줌 */
  function addNotice(ws, r, ncol, text, px, size = 11) {
    ws.mergeCells(r, 1, r, ncol);
    cell(ws, r, 1, '■ 안내', { bold: true, border: false, align: 'left', size: 12 });
    ws.getRow(r).height = 24;
    ws.mergeCells(r + 1, 1, r + 1, ncol);
    cell(ws, r + 1, 1, text, { align: 'left', size, border: false });
    ws.getCell(r + 1, 1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    ws.getRow(r + 1).height = linesHeight(text, px, size, 2) + 6;
    return r + 1;
  }
  const short = (s) => (s ? TT.shortName(s) : '');

  /* ---------- 컨텍스트 ---------- */
  /** only: { slotKey, roomId } — 고사실·교시별 시트를 그 교시/고사실만 만들기 (골라서 인쇄) */
  function context(state, idx, pl, only = {}) {
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
    const pick = (sl, room) => (!only.slotKey || sl.key === only.slotKey) && (!only.roomId || room.id === only.roomId);
    return { state, idx, pl, examTitle, period, slotTitle, usageText, only, pick };
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

  /* ---------- 2. 고사실별 시간표 (고사실 1개 = A4 가로 1장, 꽉 차게) ---------- */
  function sheetRoomTimetable(ws, ctx) {
    const { state, pl } = ctx;
    const days = state.days.filter((d) => pl.slots.some((s) => s.dayId === d.id));
    const periods = state.periods.filter((p) => pl.slots.some((s) => s.periodId === p.id));
    const ncol = days.length + 1;
    const W = PAGE.landscape.w;
    const cols = fitCols(W, [1.3, ...days.map(() => 2)]);
    setup(ws, { landscape: true, cols });
    const need = (text, c, size) => linesHeight(text, cols[c - 1] * 7 - 1, size);
    const rooms = state.rooms.filter((room) => !ctx.only.roomId || room.id === ctx.only.roomId);
    const notice = String(state.roomNotice ?? '').trim(); // 9·10단계에서 입력, 빈칸이면 생략
    let r = 1;
    let tallest = 0;
    rooms.forEach((room, ri) => {
      const r0 = r;
      r = title(ws, r, `고사실 시간표 — ${room.name}`, ncol, ctx.examTitle, 22);
      head(ws, r, ['교시', ...days.map((d) => TT.dayLabel(state, d.id))], 1, { size: 13 });
      ws.getRow(r).height = 32;
      r++;
      const body = [];
      let bodyMin = 40;
      for (const p of periods) {
        const label = `${p.name}\n${p.time || ''}`;
        cell(ws, r, 1, label, { bold: true, size: 13 });
        bodyMin = Math.max(bodyMin, need(label, 1, 13));
        days.forEach((d, i) => {
          const sl = pl.slots.find((s) => s.dayId === d.id && s.periodId === p.id);
          const x = sl?.rooms.find((y) => y.room.id === room.id);
          const text = !sl ? '' : x.kind === 'empty' ? '·' : `${ctx.usageText(x)}\n${x.students.length}명`;
          cell(ws, r, 2 + i, text, { size: 16, fill: x?.kind === 'wait' ? C.wait : x?.kind === 'conv' ? C.conv : undefined, bold: x?.kind === 'exam' });
          bodyMin = Math.max(bodyMin, need(text, 2 + i, 16));
        });
        ws.getRow(r).height = 60;
        body.push(r);
        r++;
      }
      if (notice) { spacer(ws, r, 14); r = addNotice(ws, r + 1, ncol, notice, W, 12) + 1; }
      tallest = Math.max(tallest, fitHeight(ws, r0, r, PAGE.landscape.h, [{ rows: body, min: bodyMin, max: Math.max(bodyMin, 160) }]));
      if (ri < rooms.length - 1) { pageBreak(ws, r); r += 1; }
    });
    fitScale(ws, tallest, PAGE.landscape.h);
  }

  /* ---------- 3. 고사실 명렬표 (시험실 · 자습실) ---------- */
  function sheetRoster(ws, ctx) {
    const { idx, pl } = ctx;
    setup(ws, { cols: [8, 10, 12, 18, 12, 16] });
    let r = 1;
    const blocks = pl.slots.flatMap((sl) => sl.rooms.filter((x) => x.students.length && ctx.pick(sl, x.room)).map((x) => ({ sl, x })));
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

  /* ---------- 4. 좌석배치도 (교시·고사실 1개 = A4 가로 1장, 꽉 차게) ---------- */
  function sheetSeats(ws, ctx) {
    const { state, idx, pl } = ctx;
    const blocks = pl.slots.flatMap((sl) => sl.rooms.filter((x) => (x.kind === 'exam' || x.kind === 'conv') && ctx.pick(sl, x.room)).map((x) => ({ sl, x })));
    const maxCols = Math.max(1, ...blocks.map(({ x }) => TT.seatLayout(state, x.students.length, x.room).cols));
    setup(ws, { landscape: true, cols: fitCols(PAGE.landscape.w, Array(maxCols).fill(1)) });
    let r = 1;
    let tallest = 0;
    blocks.forEach(({ sl, x }, bi) => {
      const r0 = r;
      const { cols, rows } = TT.seatLayout(state, x.students.length, x.room);
      const off = Math.floor((maxCols - cols) / 2); // 열이 적은 방은 가운데 정렬
      r = title(ws, r, `좌석배치도 — ${x.room.name}`, maxCols, ctx.examTitle, 20);
      spacer(ws, r - 1);
      ws.mergeCells(r, 1, r, maxCols);
      cell(ws, r, 1, `${ctx.slotTitle(sl)}   |   ${ctx.usageText(x).replace(/\n/g, ', ')}   |   ${x.students.length}명   |   ${cols}열 × ${rows}석`, { bold: true, fill: C.head, align: 'left', size: 12 });
      ws.getRow(r).height = 26;
      spacer(ws, r + 1);
      r += 2;
      // 교탁: 가운데 (홀수 열이면 가운데 1칸, 짝수면 가운데 2칸)
      const c0 = off + (cols % 2 ? (cols + 1) / 2 : cols / 2);
      const c1 = cols % 2 ? c0 : c0 + 1;
      if (c1 > c0) ws.mergeCells(r, c0, r, c1);
      cell(ws, r, c0, '교  탁', { bold: true, fill: C.wait, size: 13 });
      ws.getRow(r).height = 26;
      spacer(ws, r + 1);
      r += 2;
      // 1번부터 첫째 열(왼쪽) 앞→뒤로, 다음 열 순서. 빈 자리는 번호만 흐리게
      const seatRows = [];
      for (let i = 0; i < rows; i++) {
        for (let c = 0; c < cols; c++) {
          const p = c * rows + i;
          const s = x.students[p];
          const st = s && idx.studentById.get(s.id);
          if (s) cell(ws, r + i, off + c + 1, `${s.seat}\n${s.id} ${st.name}` + (s.subject && x.sections.length > 1 ? `\n${short(s.subject)}` : ''), { size: 12 });
          else cell(ws, r + i, off + c + 1, `${p + 1}\n(빈 자리)`, { size: 10, color: 'FFB0B7C3' });
        }
        seatRows.push(r + i);
      }
      r += rows + 1;
      spacer(ws, r - 1);
      if (bi < blocks.length - 1) spacer(ws, r);
      const lines = x.sections.length > 1 ? 3 : 2; // 좌석 번호, 학번 이름 (+ 과목)
      tallest = Math.max(tallest, fitHeight(ws, r0, Math.min(r, ws.rowCount), PAGE.landscape.h, [{ rows: seatRows, min: lines * 16 + 4, max: 80 }]));
      if (bi < blocks.length - 1) { pageBreak(ws, r); r++; }
    });
    fitScale(ws, tallest, PAGE.landscape.h);
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

  /* ---------- 6. 학생별 시간표 (학생 1명 = A4 세로 1장, 꽉 차게) ---------- */
  function sheetByStudent(ws, ctx) {
    const { state, idx, pl } = ctx;
    const days = state.days.filter((d) => pl.slots.some((s) => s.dayId === d.id));
    const periods = state.periods.filter((p) => pl.slots.some((s) => s.periodId === p.id));
    const ncol = Math.max(4, periods.length + 1);
    const W = PAGE.portrait.w;
    const cols = fitCols(W, [1.7, ...Array(ncol - 1).fill(2)]);
    setup(ws, { cols });
    // 칸 폭(px)과 그 안의 글이 잘리지 않는 높이
    const colPx = cols.map((w) => w * 7 + 5);
    const spanPx = (c0, c1) => colPx.slice(c0 - 1, c1).reduce((a, b) => a + b, 0) - 6;
    const need = (text, c0, c1, size) => linesHeight(text, spanPx(c0, c1), size);
    // 응시 과목 목록은 교시 수와 상관없이 일자 · 교시 · 과목 · 고사실 비율로 열을 묶음
    const listSpans = (() => {
      // 일자 24% · 교시 28% · 과목 26% · 고사실 22%에 가장 가깝게 열 4묶음으로 나눔
      const total = colPx.reduce((a, b) => a + b, 0);
      const want = [0.24, 0.28, 0.26, 0.22].map((f) => f * total);
      const px = (a, b) => colPx.slice(a - 1, b).reduce((x, y) => x + y, 0);
      let best = null;
      for (let a = 1; a <= ncol - 3; a++) for (let b = a + 1; b <= ncol - 2; b++) for (let c = b + 1; c <= ncol - 1; c++) {
        const spans = [[1, a], [a + 1, b], [b + 1, c], [c + 1, ncol]];
        const err = spans.reduce((e, [x, y], k) => e + Math.abs(px(x, y) - want[k]), 0);
        if (!best || err < best.err) best = { err, spans };
      }
      return best.spans;
    })();
    const full = (r, text, style) => { ws.mergeCells(r, 1, r, ncol); return cell(ws, r, 1, text, style); };
    const section = (r, text) => { full(r, text, { bold: true, border: false, align: 'left', size: 12 }); ws.getRow(r).height = 21; };
    const periodSpan = (i) => [2 + i, i === periods.length - 1 ? ncol : 2 + i]; // 마지막 교시가 남는 열을 채움
    const slotOrder = new Map(pl.slots.map((s, i) => [s.key, i]));
    const notice = String(state.studentNotice ?? '').trim();
    let tallest = 0;

    idx.active.forEach((st, si) => {
      const map = pl.byStudent.get(st.id);
      let r = si === 0 ? 1 : ws.rowCount + 1;
      const r0 = r;

      // 제목 · 학생 정보
      full(r, '개인 시험 시간표', { size: 22, bold: true, border: false, color: C.title });
      ws.getRow(r).height = 36;
      full(r + 1, ctx.examTitle, { size: 12, border: false, color: 'FF4B5563' });
      ws.getRow(r + 1).height = 20;
      spacer(ws, r + 2, 8);
      r += 3;
      full(r, `${state.meta.grade}학년 ${st.cls}반 ${st.no}번     ${st.name}     (학번 ${st.id})`, { size: 16, bold: true, fill: C.head });
      ws.getRow(r).height = 34;
      spacer(ws, r + 1, 10);
      r += 2;

      // 일자별 시간표: 교시·시간 머리글은 두 줄이 다 보이게
      section(r, '■ 일자별 시간표');
      r++;
      cell(ws, r, 1, '일자', { bold: true, fill: C.head, size: 11 });
      let headH = 40;
      periods.forEach((p, i) => {
        const [c0, c1] = periodSpan(i);
        if (c1 > c0) ws.mergeCells(r, c0, r, c1);
        const text = `${p.name}\n${p.time || ''}`;
        cell(ws, r, c0, text, { bold: true, fill: C.head, size: 11 });
        headH = Math.max(headH, need(text, c0, c1, 11));
      });
      ws.getRow(r).height = headH;
      r++;
      const dayRows = [];
      let dayMin = 40;
      for (const d of days) {
        const label = TT.dayLabel(state, d.id).replace(' · ', '\n');
        cell(ws, r, 1, label, { bold: true, size: 11.5 });
        dayMin = Math.max(dayMin, need(label, 1, 1, 11.5));
        periods.forEach((p, i) => {
          const [c0, c1] = periodSpan(i);
          if (c1 > c0) ws.mergeCells(r, c0, r, c1);
          const key = TT.slotKey(d.id, p.id);
          const a = map[key];
          const has = slotOrder.has(key);
          const text = !has ? '' : !a ? '-' : a.kind === 'wait' ? `자습\n${a.roomName}` : `${short(a.subject)}\n${a.roomName} · ${a.seat}번`;
          const size = a && a.kind !== 'wait' ? 12 : 10.5;
          cell(ws, r, c0, text, { size, bold: a && a.kind !== 'wait', fill: a?.kind === 'wait' ? C.wait : undefined, color: a?.kind === 'wait' ? 'FF6B7280' : undefined });
          dayMin = Math.max(dayMin, need(text, c0, c1, size));
        });
        dayRows.push(r);
        r++;
      }
      spacer(ws, r, 9);
      r++;

      // 응시 과목 목록 (시간순)
      const exams = Object.entries(map).filter(([, a]) => a.kind !== 'wait').sort((x, y) => slotOrder.get(x[0]) - slotOrder.get(y[0]));
      section(r, `■ 응시 과목 (${exams.length}과목)`);
      r++;
      const listRow = (vals, style) => {
        let h = 0;
        vals.forEach((v, i) => {
          const [c0, c1] = listSpans[i];
          if (c1 > c0) ws.mergeCells(r, c0, r, c1);
          const st = style(i);
          cell(ws, r, c0, v, st);
          h = Math.max(h, need(v, c0, c1, st.size));
        });
        return h;
      };
      ws.getRow(r).height = Math.max(26, listRow(['일자', '교시 · 시간', '과목', '고사실 · 좌석'], () => ({ bold: true, fill: C.head, size: 11 })));
      r++;
      const examRows = [];
      let examMin = 22;
      for (const [key, a] of exams) {
        const sl = pl.slots[slotOrder.get(key)];
        const p = ctx.period(sl.periodId);
        const vals = [TT.dayLabel(state, sl.dayId, { short: true }), `${p.name}  ${p.time || ''}`, short(a.subject), `${a.roomName}  ·  ${a.seat}번`];
        examMin = Math.max(examMin, listRow(vals, (i) => ({ bold: i >= 2, size: 11 })));
        examRows.push(r);
        r++;
      }
      spacer(ws, r, 9);
      r++;

      // 자습
      const waits = Object.entries(map).filter(([, a]) => a.kind === 'wait').sort((x, y) => slotOrder.get(x[0]) - slotOrder.get(y[0]));
      if (waits.length) {
        section(r, '■ 자습 (시험이 없는 교시)');
        r++;
        const text = waits.map(([key, a]) => {
          const sl = pl.slots[slotOrder.get(key)];
          return `${TT.dayLabel(state, sl.dayId, { short: true })} ${ctx.period(sl.periodId).name} → ${a.roomName}`;
        }).join('     ');
        full(r, text, { align: 'left', size: 11, fill: C.wait });
        ws.getRow(r).height = Math.max(26, linesHeight(text, W, 11, 2));
        spacer(ws, r + 1, 9);
        r += 2;
      }

      // 공통 안내 문구 (9단계에서 입력, 빈칸이면 생략)
      if (notice) r = addNotice(ws, r, ncol, notice, W, 11);
      else r--;
      // 남는 공간은 일자별 시간표 → 응시 과목 순으로 키워서 한 장을 채움
      tallest = Math.max(tallest, fitHeight(ws, r0, r, PAGE.portrait.h, [{ rows: dayRows, min: dayMin, max: Math.max(dayMin, 150) }, { rows: examRows, min: examMin, max: Math.max(examMin, 44) }]));
      if (si < idx.active.length - 1) pageBreak(ws, r);
    });
    fitScale(ws, tallest, PAGE.portrait.h);
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

  /** @param only { slotKey, roomId } 고사실·교시별 시트를 일부만 (생략하면 전체)
   *  @returns ExcelJS.Workbook */
  TT.buildWorkbook = (state, idx, pl, sheetIds, ExcelJS, only) => {
    ExcelJS = ExcelJS || root.ExcelJS;
    const wb = new ExcelJS.Workbook();
    wb.creator = '시험 시간표';
    wb.created = new Date();
    const ctx = context(state, idx, pl, only);
    for (const sh of TT.EXCEL_SHEETS) {
      if (sheetIds && !sheetIds.includes(sh.id)) continue;
      sh.build(wb.addWorksheet(sh.name), ctx);
    }
    return wb;
  };
})(typeof window !== 'undefined' ? window : globalThis);
