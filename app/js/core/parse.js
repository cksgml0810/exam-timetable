/* 나이스 '학생편성현황' 엑셀 → 프로그램 데이터
 *
 * 입력: 시트의 2차원 배열(rows). 헤더 행에 다음 열이 있어야 한다.
 *   학년도 | 학기 | 학년 | 편제명 | 개설과목(학점) | 개설강의실 | 계열/학년/학과 | 반 | 번호 | 성명
 * 출력: { meta, students, sections }
 *   students: [{ id:'20104', cls:1, no:4, name:'홍길동' }]   (id = 학번)
 *   sections: [{ id, subject, group, room, roomCls, members:[학번...] }]
 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  const COLS = {
    year: [/^학년도$/],
    semester: [/^학기$/],
    grade: [/^학년$/],
    group: [/^편제명$/, /^교과/],
    subject: [/개설과목/, /^과목/],
    room: [/강의실/],
    cls: [/^반$/],
    no: [/^번호$/],
    name: [/^성명$/, /^이름$/],
  };

  const str = (v) => (v == null ? '' : String(v).trim());
  const num = (v) => {
    const m = str(v).match(/\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  };

  function findHeader(rows) {
    for (let r = 0; r < Math.min(rows.length, 20); r++) {
      const row = (rows[r] || []).map(str);
      if (row.includes('성명') && row.includes('반') && row.includes('번호')) return r;
    }
    return -1;
  }

  function mapColumns(header) {
    const idx = {};
    for (const [key, pats] of Object.entries(COLS)) {
      for (const p of pats) {
        const i = header.findIndex((h, j) => p.test(h) && !Object.values(idx).includes(j));
        if (i >= 0) { idx[key] = i; break; }
      }
    }
    return idx;
  }

  /** '1(2학년 1반)' → 1, '편의반' → NaN */
  function roomClass(room) {
    const m = str(room).match(/(\d+)\s*반/) || str(room).match(/^(\d+)/);
    return m ? parseInt(m[1], 10) : NaN;
  }

  function parseRows(rows) {
    const h = findHeader(rows);
    if (h < 0) throw new Error('헤더(반·번호·성명)를 찾을 수 없습니다. 나이스 [학생편성현황] 엑셀 파일인지 확인하세요.');
    const col = mapColumns(rows[h].map(str));
    const missing = ['subject', 'cls', 'no', 'name'].filter((k) => col[k] == null);
    if (missing.length) throw new Error('필수 열이 없습니다: ' + missing.join(', '));

    const meta = { year: '', semester: '', grade: '' };
    const students = new Map();
    const sections = new Map();
    let rowCount = 0;
    const warnings = [];

    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r] || [];
      const subject = str(row[col.subject]);
      const cls = num(row[col.cls]);
      const no = num(row[col.no]);
      const name = str(row[col.name]);
      if (!subject || !name || isNaN(cls) || isNaN(no)) {
        if (row.some((v) => str(v))) warnings.push(`${r + 1}행: 과목/반/번호/성명이 비어 있어 건너뜀`);
        continue;
      }
      rowCount++;
      if (!meta.year && col.year != null) meta.year = str(row[col.year]);
      if (!meta.semester && col.semester != null) meta.semester = str(row[col.semester]);
      const grade = col.grade != null ? num(row[col.grade]) : NaN;
      if (!meta.grade && !isNaN(grade)) meta.grade = String(grade);

      const id = TT.studentId(isNaN(grade) ? 0 : grade, cls, no);
      if (!students.has(id)) students.set(id, { id, cls, no, name });

      const room = col.room != null ? str(row[col.room]) : '';
      const key = subject + '|' + room;
      if (!sections.has(key)) {
        sections.set(key, {
          id: key,
          subject,
          group: col.group != null ? str(row[col.group]) : '',
          room,
          roomCls: roomClass(room),
          members: [],
        });
      }
      const sec = sections.get(key);
      if (!sec.members.includes(id)) sec.members.push(id);
    }

    if (!rowCount) throw new Error('학생 수강 데이터가 없습니다.');
    const byStudent = (a, b) => (a.cls - b.cls) || (a.no - b.no);
    return {
      meta,
      rowCount,
      warnings,
      students: [...students.values()].sort(byStudent),
      sections: [...sections.values()],
    };
  }

  /** 학번: 학년(1) + 반(2) + 번호(2)  예) 2학년 5반 11번 → '20511' */
  TT.studentId = (grade, cls, no) =>
    String(grade) + String(cls).padStart(2, '0') + String(no).padStart(2, '0');

  /** ArrayBuffer(엑셀 파일) → parseRows 결과. SheetJS(XLSX) 필요 */
  TT.parseWorkbook = function (buf, XLSX) {
    XLSX = XLSX || root.XLSX;
    const wb = XLSX.read(buf, { type: 'array' });
    let lastErr;
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
      try { return parseRows(rows); } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('시트를 읽을 수 없습니다.');
  };

  TT.parseRows = parseRows;
  TT.roomClass = roomClass;
})(typeof window !== 'undefined' ? window : globalThis);
