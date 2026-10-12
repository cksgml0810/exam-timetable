/* 화면 공용 도우미: h() 요소 생성, 모달, 알림 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  /** h('div.card#id', {onclick, class, style...}, ...children) */
  function h(sel, attrs, ...kids) {
    if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
      kids.unshift(attrs);
      attrs = {};
    }
    const [, tag = 'div', rest = ''] = sel.match(/^([a-z0-9]*)(.*)$/i);
    const el = document.createElement(tag || 'div');
    rest.replace(/([.#])([^.#]+)/g, (_, t, v) => {
      if (t === '.') el.classList.add(v);
      else el.id = v;
    });
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'class') String(v).split(/\s+/).filter(Boolean).forEach((c) => el.classList.add(c));
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }
  TT.h = h;

  TT.icon = (name) => h('span.icon', { 'aria-hidden': 'true' }, ICONS[name] || '');
  const ICONS = { ok: '✓', warn: '!', err: '×', info: 'i' };

  TT.badge = (kind, text) => h('span.badge.' + kind, text);

  TT.modal = (title, body, opts = {}) => {
    const close = () => wrap.remove();
    const wrap = h('div.modal-wrap', { onclick: (e) => e.target === wrap && close() },
      h('div.modal' + (opts.wide ? '.wide' : ''),
        h('div.modal-head', h('h3', title), h('button.btn.ghost', { onclick: close }, '닫기')),
        h('div.modal-body', body)));
    document.body.appendChild(wrap);
    const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    return close;
  };

  TT.toast = (msg, kind = 'info') => {
    const t = h('div.toast.' + kind, msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  };

  TT.download = (filename, blob) => {
    const a = h('a', { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  TT.fmt = (n) => Number(n || 0).toLocaleString('ko-KR');

  /** 학생 명단 표 (모달 등에서 사용) */
  TT.studentTable = (idx, ids, extra) => {
    const rows = ids.map((id) => idx.studentById.get(id)).filter(Boolean)
      .sort((a, b) => a.cls - b.cls || a.no - b.no);
    return h('table.tbl.compact',
      h('thead', h('tr', h('th', '학번'), h('th', '반'), h('th', '번호'), h('th', '성명'), extra ? h('th', extra.title) : null)),
      h('tbody', rows.map((s) => h('tr', h('td', s.id), h('td', s.cls + '반'), h('td', s.no), h('td', s.name),
        extra ? h('td', extra.value(s)) : null))));
  };

})(typeof window !== 'undefined' ? window : globalThis);
