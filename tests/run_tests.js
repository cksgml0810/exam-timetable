/* 실제 데이터(sample/2026_2_2.xlsx)로 핵심 로직 검증:  node tests/run_tests.js
 * 다른 파일로 검증: SAMPLE=경로/파일.xlsx node tests/run_tests.js (행·학생 수 등 파일별 숫자는 기본 파일 기준) */
const fs = require('fs');
const path = require('path');
const XLSX = require('../app/vendor/xlsx.full.min.js');
global.XLSX = XLSX;
for (const f of ['parse', 'state', 'conflict', 'stats', 'autoplan', 'placement'])
  if (fs.existsSync(path.join(__dirname, `../app/js/core/${f}.js`))) require(`../app/js/core/${f}.js`);
const TT = globalThis.TT;

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? '✓' : '✗'} ${name}` + (ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`));
};

const SAMPLE = process.env.SAMPLE || path.join(__dirname, '../sample/2026_2_2.xlsx');
if (!fs.existsSync(SAMPLE)) { console.log(`${SAMPLE} 없음 — 건너뜀`); process.exit(0); }
const parsed = TT.parseWorkbook(new Uint8Array(fs.readFileSync(SAMPLE)), XLSX);

eq('행 수', parsed.rowCount, 4170);
eq('학생 수', parsed.students.length, 417);
eq('분반 수', parsed.sections.length, 130);
eq('학번 형식', parsed.students[0].id, '20101');

const state = TT.defaultState();
TT.applyImport(state, parsed, 'sample');
eq('반 수', TT.classList(state).length, 13);
eq('기본 고사실', state.rooms.length, 13);
let idx = TT.index(state);
eq('과목 수', idx.subjects.length, 22);
eq('화법과 언어 인원', idx.subjectByName.get('화법과 언어(4)').count, 417);
eq('1인 10과목', [...idx.studentSubjects.values()].every((l) => l.length === 10), true);

// 동시시험: 전교생 과목끼리는 충돌, 선택과목끼리 0명 조합 존재
eq('필수끼리 충돌', TT.overlap(idx, '화법과 언어(4)', '영어Ⅱ(4)'), 417);

// 기존 프로그램(415명, 2명 제외)의 시간표를 재현해 StuCount와 비교
const inProgram = process.env.PROGRAM_IDS ? new Set(fs.readFileSync(process.env.PROGRAM_IDS, 'utf8').split('\n')) : null;
if (inProgram) for (const s of parsed.students) if (!inProgram.has(s.id)) state.excluded[s.id] = true;
idx = TT.index(state);
const ev = ['화법과 언어(4)', '미적분Ⅰ(4)', '영어Ⅱ(4)', '윤리와 사상(3)', '정치(3)', '한국지리 탐구(3)', '물질과 에너지(3)', '세포와 물질대사(3)', '역학과 에너지(3)'];
ev.forEach((s) => (state.evalSubjects[s] = true));
state.schedule = {
  'd1|p1': ['미적분Ⅰ(4)'], 'd1|p3': ['세포와 물질대사(3)'],
  'd2|p1': ['정치(3)'], 'd2|p2': ['물질과 에너지(3)'], 'd2|p3': ['한국지리 탐구(3)'],
  'd3|p1': ['화법과 언어(4)'], 'd3|p3': ['윤리와 사상(3)'],
  'd4|p1': ['영어Ⅱ(4)'], 'd4|p3': ['역학과 에너지(3)'],
};
const st = TT.scheduleStats(state, idx);
if (inProgram) {
  eq('제외 후 학생 수', idx.active.length, 415);
  eq('1일차 분포', st.days[0].dist, [0, 194, 221]);
  eq('2일차 분포', st.days[1].dist, [20, 239, 156]);
  eq('3일차 분포', st.days[2].dist, [0, 160, 255]);
  eq('4일차 분포', st.days[3].dist, [0, 262, 153]);
}
eq('미편성 없음', st.unplaced, []);
eq('같은 칸 충돌 없음', st.clashCount, 0);
console.log('하루 최대', st.maxPerDay, '/ 시험 없는 날 있는 학생', st.noExamDay.length);
const groups = TT.compatibleGroups(idx, ev);
console.log('동시시험 가능 조합', groups.slice(0, 5));
groups.forEach((g) => g.forEach((a) => g.forEach((b) => { if (a !== b && TT.overlap(idx, a, b)) fails++; })));

// 자동 배치: 12과목 · 4일×3교시 · 하루 최대 2 / 최소 1
{
  const s2 = JSON.parse(JSON.stringify(state));
  ['기하(3)', '영미 문학 읽기(3)', '지구시스템과학(3)'].forEach((n) => (s2.evalSubjects[n] = true));
  s2.schedule = {};
  s2.locked = { '화법과 언어(4)': true };
  s2.schedule['d1|p1'] = ['화법과 언어(4)'];
  const idx2 = TT.index(s2);
  const rules = { maxPerDay: 2, minPerDay: 1 };
  const t0 = Date.now();
  const res = TT.autoPlan(s2, idx2, { ...rules, seed: 1 });
  const ms = Date.now() - t0;
  s2.schedule = res.schedule;
  const st2 = TT.scheduleStats(s2, idx2);
  const rs = TT.ruleStats(s2, st2, rules);
  console.log(`자동 배치 ${ms}ms: 최대 ${st2.maxPerDay}과목, 최대 초과 ${rs.over.length}명, 최소 미달 ${rs.under.length}명, 미편성 ${res.unplaced.length}, 고사실 부족 ${rs.roomShort}칸`);
  console.log(' ', JSON.stringify(res.schedule));
  eq('자동: 충돌 없음', st2.clashCount, 0);
  eq('자동: 모두 편성', res.unplaced, []);
  eq('자동: 고정 과목 유지', res.schedule['d1|p1']?.includes('화법과 언어(4)'), true);
  // 기존 수작업 시간표(9과목)보다 나빠지면 안 됨: 최대 초과 0, 최소 미달 ≤ 20
  const s3 = JSON.parse(JSON.stringify(state));
  s3.schedule = {};
  const r3 = TT.autoPlan(s3, idx, { ...rules, seed: 1 });
  s3.schedule = r3.schedule;
  const rs3 = TT.ruleStats(s3, TT.scheduleStats(s3, idx), rules);
  console.log(`9과목 자동 배치: 최대 초과 ${rs3.over.length}명, 최소 미달 ${rs3.under.length}명`);
  eq('9과목: 최대 초과 없음', rs3.over.length, 0);
  eq('9과목: 최소 미달 ≤ 수작업(20명)', rs3.under.length <= 20, true);
  const fill = TT.autoPlan({ ...s2, schedule: { 'd2|p2': ['기하(3)'] }, locked: {} }, idx2, { ...rules, mode: 'fill' });
  eq('채우기: 기존 배치 유지', fill.schedule['d2|p2']?.includes('기하(3)'), true);
  eq('같은 seed → 같은 결과', JSON.stringify(TT.autoPlan(s2, idx2, { ...rules, seed: 7 }).schedule), JSON.stringify(TT.autoPlan(s2, idx2, { ...rules, seed: 7 }).schedule));
}

// 배치: 9과목 수작업 시간표 + 특별실 2개(기존 프로그램과 같은 구성)
{
  state.rooms.push({ id: 'rx1', name: '열정관', type: 'special', cls: null, cap: 40 }, { id: 'rx2', name: '지성관', type: 'special', cls: null, cap: 40 });
  for (const mode of ['even', 'own']) {
    state.waitMode = mode;
    const pl = TT.placeAll(state, idx);
    let bad = 0;
    for (const sl of pl.slots) {
      const seen = new Map();
      for (const x of sl.rooms) for (const s of x.students) seen.set(s.id, (seen.get(s.id) || 0) + 1);
      if (seen.size !== idx.active.length || [...seen.values()].some((v) => v !== 1)) bad++;
    }
    eq(`배치(${mode}): 모든 교시 학생 1명당 정확히 1곳`, bad, 0);
    console.log(`  배치(${mode}) 오류 ${pl.errors.length}건`, pl.errors.slice(0, 3).map((e) => e.text));
  }
  state.waitMode = 'even';
  // 시험실 모으기: 7개 분반 → 2-1~2-7 시험, 2-8~2-13 자습
  const kinds = (x) => x.rooms.filter((r) => r.room.type === 'class').map((r) => r.kind[0]).join('');
  state.roomMode = 'cluster';
  const cl = TT.placeSlot(state, idx, 'd1|p3');
  eq('모으기(앞부터): 시험 7개 연속 후 자습', kinds(cl), 'eeeeeeewwwwww');
  state.clusterAt = 'best';
  const cb = TT.placeSlot(state, idx, 'd1|p3');
  console.log('  모으기(최적 위치):', kinds(cb));
  eq('모으기(최적): 시험실이 한 덩어리', /^w*e+w*$/.test(kinds(cb)), true);
  state.clusterAt = 'front';
  state.roomRoles = { 'd1|p3': { [state.rooms[0].id]: 'wait' } };
  eq('방 용도 직접 지정(2-1 자습)', kinds(TT.placeSlot(state, idx, 'd1|p3')), 'weeeeeeewwwww');
  state.roomRoles = {};
  state.roomMode = 'own';
  const sl = TT.placeSlot(state, idx, 'd1|p3');
  console.log('  1일차 3교시:', sl.rooms.map((x) => `${x.room.name}:${x.kind === 'exam' ? x.sections.map((q) => q.label).join('+') : x.kind}(${x.students.length})`).join(' '));
  // 수동 지정
  const sec = sl.units[0].sec.id;
  state.placement = { 'd1|p3': { [sec]: 'rx2' } };
  eq('수동 지정 반영', TT.placeSlot(state, idx, 'd1|p3').units.find((u) => u.sec.id === sec).roomId, 'rx2');
  state.placement = {};
  // 나누기: 분반의 3명만 지성관으로
  const big = sl.units.slice().sort((a, b) => b.members.length - a.members.length)[0];
  state.splits = { 'd1|p3': { [big.sec.id]: { roomId: 'rx2', count: 3 } } };
  const spl = TT.placeSlot(state, idx, 'd1|p3');
  const ji = spl.rooms.find((x) => x.room.id === 'rx2');
  eq('나누기: 지성관에 3명', ji.students.length, 3);
  eq('나누기: 원래 방은 3명 줄어듦', spl.units.find((u) => u.sec.id === big.sec.id && !u.part).members.length, big.members.length - 3);
  eq('나누기 후에도 전원 1곳', new Set(spl.rooms.flatMap((x) => x.students.map((q) => q.id))).size, idx.active.length);
  state.splits = {};
  // 편의반
  const sp = idx.active[0].id;
  state.special = { [sp]: true };
  state.rooms.push({ id: 'rc', name: '편의반', type: 'convenience', cls: null, cap: 10 });
  const pc = TT.placeAll(state, idx);
  eq('편의반 학생 → 편의반 고사실', pc.byStudent.get(sp)['d1|p1'].roomName, '편의반');
  // 편의반 2개: 학번순으로 고르게 자동 배치 → 학생별로 옮기기 (모든 교시 공통)
  const sps = idx.active.slice(0, 5).map((s) => s.id);
  state.special = Object.fromEntries(sps.map((id) => [id, true]));
  state.rooms.push({ id: 'rc2', name: '통합반', type: 'convenience', cls: null, cap: 10 });
  const roomOf = (p, id) => [...new Set(p.slots.map((sl) => p.byStudent.get(id)[sl.key]).filter((a) => a.kind === 'conv').map((a) => a.roomId))];
  const auto = TT.convAssign(state, idx);
  eq('편의반 자동: 고르게 나눔', sps.map((id) => auto.get(id).roomId), ['rc', 'rc2', 'rc', 'rc2', 'rc']);
  state.convRoom = { [sps[0]]: 'rc2' };
  const moved = TT.placeAll(state, idx);
  eq('편의반 직접 옮기기: 모든 교시 통합반', roomOf(moved, sps[0]), ['rc2']);
  eq('편의반 직접 지정 표시', TT.convAssign(state, idx).get(sps[0]).manual, true);
  eq('한 명 옮겨도 다른 학생은 그대로', sps.slice(1).map((id) => TT.convAssign(state, idx).get(id).roomId), ['rc2', 'rc', 'rc2', 'rc']);
  eq('편의반 옮긴 뒤에도 전원 1곳', moved.slots.every((sl) => new Set(sl.rooms.flatMap((x) => x.students.map((q) => q.id))).size === idx.active.length), true);
  state.convRoom = { [sps[0]]: 'deleted-room' };
  eq('없어진 방 지정은 자동으로', TT.convAssign(state, idx).get(sps[0]).manual, false);
  state.convRoom = {};
  state.special = {};
  state.rooms = state.rooms.filter((r) => r.id !== 'rc' && r.id !== 'rc2');
  state.roomMode = 'cluster';
  global.__placementState = state;
}

// 엑셀 출력
(async () => {
  if (!global.__placementState) return;
  require('../app/js/export/excel.js');
  const ExcelJS = require('../app/vendor/exceljs.min.js');
  const st = global.__placementState;
  st.days.forEach((d, i) => (d.date = `2026-10-1${3 + i}`));
  const ix = TT.index(st);
  const pl = TT.placeAll(st, ix);
  const wb = TT.buildWorkbook(st, ix, pl, null, ExcelJS);
  const buf = await wb.xlsx.writeBuffer();
  const out = process.env.XLSX_OUT;
  if (out) fs.writeFileSync(out, Buffer.from(buf));
  const back = XLSX.read(Buffer.from(buf));
  eq('엑셀 시트', back.SheetNames, TT.EXCEL_SHEETS.map((s) => s.name));
  const roster = XLSX.utils.sheet_to_json(back.Sheets['명렬표'], { header: 1 });
  const names = roster.filter((r) => /^\d{5}$/.test(String(r[1]))).length;
  eq('명렬표 인원 = 학생 수 × 교시 수', names, ix.active.length * pl.slots.length);
  const sw = TT.buildWorkbook(st, ix, pl, ['student'], ExcelJS).worksheets[0];
  eq('학생별 시간표: 학생 1명당 1쪽', sw.rowBreaks.length + 1, ix.active.length);
  const texts = (w) => { const t = []; w.eachRow((row) => t.push(String(row.getCell(1).value ?? ''))); return t; }; // 병합 셀은 첫 칸만
  eq('학생별 시간표: 기본 안내 문구', texts(sw).filter((t) => t === TT.DEFAULT_NOTICE).length, ix.active.length);
  st.studentNotice = '★ 공통 안내\n★ 두 번째 줄';
  const sw2 = TT.buildWorkbook(st, ix, pl, ['student'], ExcelJS).worksheets[0];
  eq('학생별 시간표: 입력한 안내 문구', texts(sw2).filter((t) => t === st.studentNotice).length, ix.active.length);
  st.studentNotice = '';
  const sw3 = TT.buildWorkbook(st, ix, pl, ['student'], ExcelJS).worksheets[0];
  eq('학생별 시간표: 빈 안내 문구는 생략', texts(sw3).includes('■ 안내'), false);
  eq('학생별 시간표: 생략해도 1명당 1쪽', sw3.rowBreaks.length + 1, ix.active.length);
  console.log(fails ? `\n실패 ${fails}건` : '\n모두 통과');
  process.exit(fails ? 1 : 0);
})();
