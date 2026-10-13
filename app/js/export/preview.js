/* 엑셀 미리보기: ExcelJS 시트를 A4 종이 모양 HTML로 그린다 (페이지 나눔 기준)
 * 엑셀 파일과 같은 시트 빌더를 쓰므로, 보이는 내용 = 내려받는 내용
 */
(function (root) {
  const TT = root.TT;
  const { h } = TT;

  const argb = (c) => (c && c.argb ? '#' + c.argb.slice(-6) : null);

  /** 페이지 범위 [[시작행, 끝행], ...] */
  TT.sheetPages = (ws) => {
    const breaks = (ws.rowBreaks || []).map((b) => b.id).sort((a, b) => a - b);
    const pages = [];
    let start = 1;
    for (const b of breaks) {
      if (b >= start) pages.push([start, b]);
      start = b + 1;
    }
    if (start <= ws.rowCount) pages.push([start, ws.rowCount]);
    return pages.length ? pages : [[1, Math.max(1, ws.rowCount)]];
  };

  /** 한 페이지 → 종이 모양 요소
   *  opts.print: 인쇄용 — A4(여백 10mm) 한 장에 가로·세로 모두 들어가게 축소 */
  TT.renderSheetPage = (ws, [r0, r1], opts = {}) => {
    const ncol = ws.columnCount;
    const widths = Array.from({ length: ncol }, (_, i) => Math.round((ws.getColumn(i + 1).width || 9) * 7 + 5));
    const total = widths.reduce((a, b) => a + b, 0);
    const landscape = ws.pageSetup?.orientation === 'landscape';
    const paperW = landscape ? 1123 : 794;
    const inner = paperW - 60;
    let zoom = Math.min(1.3, inner / total);
    if (opts.print) {
      const [pw, ph] = landscape ? [1047, 718] : [718, 1047]; // A4 - 여백 10mm (px)
      let height = 0;
      for (let r = r0; r <= r1; r++) height += Math.round((ws.getRow(r).height || 18) * 1.33);
      zoom = Math.min(1.3, pw / total, ph / height);
    }

    // 병합 정보
    const span = new Map(); // 'r,c' → {rs, cs}
    const covered = new Set();
    for (const m of Object.values(ws._merges || {})) {
      const { top, left, bottom, right } = m.model;
      if (bottom < r0 || top > r1) continue;
      span.set(top + ',' + left, { rs: Math.min(bottom, r1) - top + 1, cs: right - left + 1 });
      for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) if (r !== top || c !== left) covered.add(r + ',' + c);
    }

    const tbody = h('tbody');
    for (let r = r0; r <= r1; r++) {
      const row = ws.getRow(r);
      const tr = h('tr', { style: { height: Math.round((row.height || 18) * 1.33) + 'px' } });
      for (let c = 1; c <= ncol; c++) {
        if (covered.has(r + ',' + c)) continue;
        const cell = row.getCell(c);
        const sp = span.get(r + ',' + c);
        const st = {};
        const f = cell.font || {};
        if (f.bold) st.fontWeight = '700';
        if (f.size) st.fontSize = f.size * 1.33 + 'px';
        if (argb(f.color)) st.color = argb(f.color);
        if (cell.fill?.fgColor) st.background = argb(cell.fill.fgColor);
        const al = cell.alignment || {};
        st.textAlign = al.horizontal || 'left';
        const b = cell.border || {};
        if (b.top || b.left || b.bottom || b.right) st.border = '1px solid #9ca3af';
        const v = cell.value;
        tr.appendChild(h('td', { rowspan: sp?.rs > 1 ? sp.rs : null, colspan: sp?.cs > 1 ? sp.cs : null, style: st }, v == null ? '' : String(cell.text ?? v)));
      }
      tbody.appendChild(tr);
    }
    const table = h('table.xl', { style: { width: total + 'px', zoom } },
      h('colgroup', widths.map((w) => h('col', { style: { width: w + 'px' } }))), tbody);
    return h('div.paper' + (landscape ? '.landscape' : ''), table);
  };

  /** 시트의 모든 쪽을 바로 인쇄 (브라우저 인쇄 창) */
  TT.preparePrint = (ws) => {
    const landscape = ws.pageSetup?.orientation === 'landscape';
    document.getElementById('print-root')?.remove();
    const root = h('div#print-root', TT.sheetPages(ws).map((pg) => TT.renderSheetPage(ws, pg, { print: true })));
    const style = h('style', `@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 10mm; }`);
    document.body.append(style, root);
    document.body.classList.add('printing');
    return () => { root.remove(); style.remove(); document.body.classList.remove('printing'); };
  };
  TT.printSheet = (ws) => {
    const cleanup = TT.preparePrint(ws);
    const done = () => { cleanup(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  };
})(window);
