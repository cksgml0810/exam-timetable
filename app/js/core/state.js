/* 프로젝트 상태 · 파생 색인 · 저장
 *
 * 모든 작업 내용은 state 하나에 담기며, 브라우저(localStorage)에 자동 저장되고
 * '프로젝트 저장'으로 .json 파일로 내보내 다른 컴퓨터에서 이어서 열 수 있다.
 */
(function (root) {
  const TT = (root.TT = root.TT || {});
  const STORAGE_KEY = 'tt.project.v1';
  const VERSION = 1;

  let seq = Date.now() % 100000;
  TT.uid = (p) => p + (seq++).toString(36);

  TT.ROOM_TYPES = {
    class: '학급 교실',
    special: '특별실',
    convenience: '편의반',
    study: '자습실',
  };

  TT.DEFAULT_NOTICE = [
    '★ 위 시간표에는 응시하는 과목의 고사실과 좌석 번호가 적혀 있습니다.',
    '★ 해당 고사실을 꼭 확인하여 모든 소지품을 가지고 이동합니다.',
    '★ 시험이 없는 교시에는 지정된 자습실에서 출석 확인 후 조용히 자습합니다.',
    '★ 시험 시작 5분 전까지 입실합니다.',
  ].join('\n');

  TT.defaultState = () => ({
    version: VERSION,
    step: 1,
    meta: { year: '', semester: '', grade: '', examName: '중간고사' },
    data: null, // { fileName, importedAt, rowCount, students, sections }
    excluded: {}, // 학번 → true : 시험 미응시(제외)
    special: {}, // 학번 → true : 편의반 대상
    convRoom: {}, // 학번 → 편의반 고사실id : 7단계에서 직접 옮긴 편의반 학생 (없으면 자동)
    extraClasses: [], // 데이터에 없지만 추가한 반 번호
    days: [1, 2, 3, 4].map((n) => ({ id: 'd' + n, date: '' })),
    periods: [
      { id: 'p1', name: '1교시', time: '08:50~09:40' },
      { id: 'p2', name: '2교시', time: '10:10~11:00' },
      { id: 'p3', name: '3교시', time: '11:30~12:20' },
    ],
    off: {}, // 'dayId|periodId' → true : 그 날 쓰지 않는 교시
    rooms: [],
    evalSubjects: {}, // 과목명 → true
    schedule: {}, // 'dayId|periodId' → [과목명...]
    seatCols: 5, // 좌석배치: 5열
    seatRows: 7, //          × 열마다 7석 (= 35석)
    planRules: { maxPerDay: 2, minPerDay: 1, mode: 'all' }, // 자동 배치 목표
    locked: {}, // 과목명 → true : 자동 배치 때 움직이지 않음(🔒)
    placement: {}, // 'dayId|periodId' → { 분반id: 고사실id } : 수동 지정
    splits: {}, // 'dayId|periodId' → { 분반id: { roomId, count } } : 분반 일부(학번 뒤쪽 count명)를 다른 방으로
    roomMode: 'cluster', // 시험실: 'cluster' 한 묶음으로 모으기 | 'own' 분반을 자기 반 교실에
    clusterAt: 'front', // 묶음 위치: 'front' 앞 번호부터 | 'best' 분반 교실이 가장 많이 들어가는 위치
    roomRoles: {}, // 'dayId|periodId' → { 고사실id: 'exam'|'wait'|'off' } : 방 용도 직접 지정
    waitMode: 'even', // 자습 배치: 'even' 학번순 고르게 | 'own' 자기 반 교실 우선
    seatMode: 'id', // 좌석: 'id' 학번순 | 'random' 무작위
    seatSeed: 1,
    studentNotice: TT.DEFAULT_NOTICE, // 학생별 시간표 아래 공통 안내 문구 (빈칸이면 넣지 않음)
    roomNotice: '', // 고사실 시간표 아래 공통 안내 문구 (빈칸이면 넣지 않음)
  });

  TT.slotKey = (dayId, periodId) => dayId + '|' + periodId;

  /** 과목명에서 학점 표시 제거: '미적분Ⅰ(4)' → '미적분Ⅰ' */
  TT.shortName = (s) => String(s).replace(/\(\d+\)$/, '');

  /* ---------- 날짜 표시 ---------- */
  const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
  TT.dayLabel = (state, dayId, opts = {}) => {
    const i = state.days.findIndex((d) => d.id === dayId);
    const d = state.days[i];
    const base = `${i + 1}일차`;
    if (!d || !d.date) return base;
    const dt = new Date(d.date + 'T00:00:00');
    const md = `${dt.getMonth() + 1}/${dt.getDate()}(${WEEK[dt.getDay()]})`;
    return opts.short ? md : `${base} · ${md}`;
  };

  /* ---------- 반 목록 ---------- */
  TT.classList = (state) => {
    const set = new Set(state.extraClasses);
    if (state.data) state.data.students.forEach((s) => set.add(s.cls));
    return [...set].sort((a, b) => a - b);
  };

  /* ---------- 파생 색인 (데이터·제외 학생이 바뀔 때만 다시 계산) ---------- */
  let memo = { key: null, value: null };
  TT.index = (state) => {
    if (!state.data) return null;
    const key = state.data.importedAt + '|' + Object.keys(state.excluded).filter((k) => state.excluded[k]).sort().join(',');
    if (memo.key === key) return memo.value;

    const all = state.data.students;
    const active = all.filter((s) => !state.excluded[s.id]);
    const activeSet = new Set(active.map((s) => s.id));
    const studentById = new Map(all.map((s) => [s.id, s]));

    const subjects = [];
    const subjectByName = new Map();
    const studentSubjects = new Map(active.map((s) => [s.id, []]));
    const studentSection = new Map(); // 학번|과목 → section

    for (const sec of state.data.sections) {
      let subj = subjectByName.get(sec.subject);
      if (!subj) {
        subj = { name: sec.subject, group: sec.group, sections: [], members: new Set() };
        subjectByName.set(sec.subject, subj);
        subjects.push(subj);
      }
      const members = sec.members.filter((id) => activeSet.has(id));
      subj.sections.push({ ...sec, activeMembers: members });
      for (const id of members) {
        if (!subj.members.has(id)) studentSubjects.get(id).push(sec.subject);
        subj.members.add(id);
        studentSection.set(id + '|' + sec.subject, sec);
      }
    }
    subjects.forEach((s) => (s.count = s.members.size));

    const value = { all, active, studentById, subjects, subjectByName, studentSubjects, studentSection };
    memo = { key, value };
    return value;
  };

  /** 데이터 가져온 직후 기본값 채우기 */
  TT.applyImport = (state, parsed, fileName) => {
    state.data = {
      fileName,
      importedAt: new Date().toISOString(),
      rowCount: parsed.rowCount,
      students: parsed.students,
      sections: parsed.sections,
    };
    state.meta.year = state.meta.year || parsed.meta.year;
    state.meta.semester = state.meta.semester || parsed.meta.semester;
    state.meta.grade = state.meta.grade || parsed.meta.grade;
    state.excluded = {};
    state.special = {};
    state.convRoom = {};
    state.evalSubjects = {};
    state.schedule = {};
    if (!state.rooms.length) state.rooms = TT.defaultRooms(state);
  };

  TT.defaultRooms = (state) => {
    const g = state.meta.grade || '';
    return TT.classList(state).map((c) => ({
      id: TT.uid('r'),
      name: g ? `${g}-${c}` : `${c}반`,
      type: 'class',
      cls: c,
      cap: 35,
    }));
  };

  /* ---------- 저장소 ---------- */
  const listeners = new Set();
  const store = {
    state: TT.defaultState(),
    savedAt: null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** mutator(state)로 상태를 바꾸고 저장 + 다시 그리기 */
    update(mutator) {
      mutator(store.state);
      store.persist();
      listeners.forEach((fn) => fn(store.state));
    },
    persist() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store.state));
        store.savedAt = new Date();
      } catch (e) {
        console.warn('자동 저장 실패', e);
      }
    },
    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) store.state = TT.migrate(JSON.parse(raw));
      } catch (e) {
        console.warn('저장된 작업을 불러오지 못했습니다', e);
      }
      return store.state;
    },
    replace(next) {
      store.state = TT.migrate(next);
      store.persist();
      listeners.forEach((fn) => fn(store.state));
    },
    reset() { store.replace(TT.defaultState()); },
    toJSON() { return JSON.stringify(store.state, null, 1); },
  };
  TT.store = store;

  /** 예전 버전 저장본에 빠진 항목 채우기 */
  TT.migrate = (s) => {
    const d = TT.defaultState();
    if (s.seatRows === undefined) s.seatCols = d.seatCols; // 예전 기본값(6열) → 5열×7석
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    s.version = VERSION;
    return s;
  };
})(typeof window !== 'undefined' ? window : globalThis);
