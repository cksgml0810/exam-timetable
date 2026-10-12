/* 고사실 배치 · 자습실 배치 · 좌석 번호
 *
 * 교시(칸)마다
 *   1) 시험 분반 → 고사실: 수동 지정(state.placement) > 개설강의실의 반 교실 > 같은 이름의 고사실 > 빈 특별실 > 빈 교실
 *      빈 방이 없으면 정원이 남는 시험 고사실에 합반
 *   2) 편의반 학생(1단계 표시)은 그 교시 시험이 있으면 편의반 고사실로
 *   3) 그 교시 시험이 없는 학생(미응시) → 자습실: 시험에 쓰지 않는 방 중 '자습 사용' 방
 *      waitMode 'even' : 학번순으로 자습실들에 고르게
 *      waitMode 'own'  : 자기 반 교실이 비어 있으면 그대로, 나머지는 남는 자습실에
 *   4) 좌석 번호: 시험실은 학번순 또는 무작위(seatMode), 자습실은 학번순
 *   roomMode 'cluster'(기본): 필요한 시험실 수만큼 고사실 목록 순서대로 한 묶음(예: 2-1~2-7)을 시험실로,
 *            나머지(2-8~2-13)를 자습실로 — 시험실 사이에 자습실이 끼지 않게
 *            clusterAt 'front' 앞 번호부터 | 'best' 분반 교실이 가장 많이 들어가는 위치
 *   roomMode 'own': 분반을 개설강의실의 반 교실에 (흩어질 수 있음)
 *   수동 조정: state.roomRoles[교시][고사실id] = 'exam'|'wait'|'off'  (방 용도 직접 지정)
 *              state.placement[교시][분반id] = 고사실id        (분반 통째로 옮기기)
 *              state.splits[교시][분반id] = { roomId, count }  (분반의 뒤쪽 count명만 다른 방으로)
 */
(function (root) {
  const TT = (root.TT = root.TT || {});

  TT.waitAllowed = (room) => room.wait ?? (room.type === 'class' || room.type === 'study');

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  /** 좌석 모양 선택지 */
  TT.SEAT_PRESETS = [[5, 7], [6, 5], [6, 6]];

  /** 좌석 배치 모양: 고사실별 지정(room.seatCols/seatRows) > 전체 기본(5열 × 7석).
   *  인원이 많으면 뒤로 줄을 늘림. 번호는 1열 앞→뒤, 2열 앞→뒤 … */
  TT.seatLayout = (state, n, room) => {
    const own = room && room.seatCols && room.seatRows;
    const cols = Math.max(1, (own ? room.seatCols : state.seatCols) || 5);
    const base = (own ? room.seatRows : state.seatRows) || 7;
    return { cols, rows: Math.max(base, Math.ceil(n / cols)), own: !!own };
  };

  /** 분반 표시: '1(2학년 1반)' → '1반', 그 외는 강의실명 그대로 */
  TT.sectionLabel = (sec) => (isNaN(sec.roomCls) ? sec.room : `${sec.roomCls}반`);

  /** 한 교시 배치 */
  TT.placeSlot = (state, idx, key) => {
    const subjects = TT.slotSubjects(state, idx, key);
    const special = state.special || {};
    const overrides = (state.placement || {})[key] || {};
    const splits = (state.splits || {})[key] || {};
    const rooms = state.rooms;
    const use = new Map(rooms.map((r) => [r.id, { room: r, kind: 'empty', sections: [], students: [] }]));
    const errors = [];
    const convRooms = rooms.filter((r) => r.type === 'convenience');

    // 시험 단위(분반) 만들기
    const units = [];
    const convStudents = [];
    const takers = new Set();
    for (const name of subjects) {
      for (const sec of idx.subjectByName.get(name).sections) {
        const members = [];
        for (const id of sec.activeMembers) {
          takers.add(id);
          if (special[id] && convRooms.length) convStudents.push({ id, subject: name, sectionId: sec.id });
          else members.push(id);
        }
        if (!members.length) continue;
        // 나누기: 학번 뒤쪽 count명을 지정한 방으로
        const sp = splits[sec.id];
        const rr = sp && rooms.find((r) => r.id === sp.roomId && r.type !== 'convenience');
        if (rr && sp.count > 0 && sp.count < members.length) {
          members.sort(byId);
          const extra = members.splice(members.length - sp.count, sp.count);
          units.push({ sec, subject: name, members, splitCount: sp.count });
          units.push({ sec, subject: name, members: extra, part: 2, forcedRoom: rr });
        } else units.push({ sec, subject: name, members });
      }
    }
    if (subjects.length && Object.keys(special).some((id) => special[id] && takers.has(id)) && !convRooms.length) {
      errors.push({ code: '편의반없음', text: '편의반 학생이 있지만 편의반 고사실이 없습니다. (3단계에서 추가)' });
    }

    const assign = (u, r) => {
      const x = use.get(r.id);
      x.kind = 'exam';
      x.sections.push({ id: u.sec.id, subject: u.subject, label: TT.sectionLabel(u.sec) + (u.part === 2 ? ' 일부' : ''), count: u.members.length, part: u.part || 1 });
      x.students.push(...u.members.map((id) => ({ id, subject: u.subject, sectionId: u.sec.id })));
      u.roomId = r.id;
    };
    const roles = (state.roomRoles || {})[key] || {};
    const canExam = (r) => r.type !== 'convenience' && r.type !== 'study' && roles[r.id] !== 'wait' && roles[r.id] !== 'off';
    const free = (r) => use.get(r.id).kind === 'empty' && canExam(r);
    const isHome = (r, u) => (r.type === 'class' && +r.cls === u.sec.roomCls) || r.name === u.sec.room;

    // 1) 수동 지정 (나눈 학생 → 지정 방, 분반 → 지정 방)
    for (const u of units.filter((x) => x.forcedRoom)) {
      if (use.get(u.forcedRoom.id).kind !== 'wait') assign(u, u.forcedRoom);
    }
    for (const u of units.filter((x) => !x.forcedRoom)) {
      const rid = overrides[u.sec.id];
      const r = rid && rooms.find((x) => x.id === rid);
      if (r && r.type !== 'convenience' && use.get(r.id).kind !== 'wait') assign(u, r);
    }
    const big = units.filter((u) => !u.roomId).sort((a, b) => b.members.length - a.members.length);
    if (state.roomMode === 'own') {
      // 2) 분반 → 자기 반 교실 (시험으로 지정한 방 먼저 채움)
      for (const u of big) {
        const r = rooms.find((x) => free(x) && isHome(x, u));
        if (r) assign(u, r);
      }
      // 3) 시험 지정 방 → 빈 특별실 → 빈 교실
      for (const u of big.filter((x) => !x.roomId)) {
        const r = rooms.find((x) => free(x) && roles[x.id] === 'exam')
          || rooms.find((x) => free(x) && x.type === 'special')
          || rooms.find((x) => free(x));
        if (r) assign(u, r);
      }
    } else {
      // 2) 시험실 묶음 고르기: '시험' 지정 방 + 목록 순서로 이어진 방 need개
      const pending = big;
      const forced = rooms.filter((r) => free(r) && roles[r.id] === 'exam');
      const line = rooms.filter((r) => free(r) && roles[r.id] !== 'exam');
      const need = Math.max(0, Math.min(line.length, pending.length - forced.length));
      let start = 0;
      if (state.clusterAt === 'best' && need) {
        let bestScore = -1;
        for (let i = 0; i + need <= line.length; i++) {
          const win = line.slice(i, i + need);
          const score = pending.filter((u) => win.some((r) => isHome(r, u))).length;
          if (score > bestScore) { bestScore = score; start = i; }
        }
      }
      const block = [...forced, ...line.slice(start, start + need)];
      // 3) 묶음 안에서: 자기 반 교실이 있으면 그 방, 나머지는 반 번호순으로 앞 방부터(정원 맞는 방 우선)
      for (const u of pending) {
        const r = block.find((x) => free(x) && isHome(x, u));
        if (r) assign(u, r);
      }
      const rest = pending.filter((u) => !u.roomId).sort((a, b) => (a.sec.roomCls || 99) - (b.sec.roomCls || 99));
      for (const u of rest) {
        const r = block.find((x) => free(x) && x.cap >= u.members.length) || block.find((x) => free(x));
        if (r) assign(u, r);
      }
      // 묶음이 모자라면(방 부족) 남은 아무 방
      for (const u of rest.filter((x) => !x.roomId)) {
        const r = rooms.find((x) => free(x));
        if (r) assign(u, r);
      }
    }
    // 4) 합반: 정원이 남는 시험실
    for (const u of big.filter((x) => !x.roomId)) {
      const r = rooms
        .filter((x) => use.get(x.id).kind === 'exam' && use.get(x.id).students.length + u.members.length <= x.cap)
        .sort((a, b) => (a.cap - use.get(a.id).students.length) - (b.cap - use.get(b.id).students.length))[0];
      if (r) assign(u, r);
      else errors.push({ code: '응시미배치', text: `${TT.shortName(u.subject)} ${TT.sectionLabel(u.sec)} 분반(${u.members.length}명)을 넣을 고사실이 없습니다.` });
    }

    // 편의반
    for (const s of convStudents) {
      const r = convRooms.find((x) => use.get(x.id).students.length < x.cap) || convRooms[0];
      const x = use.get(r.id);
      x.kind = 'conv';
      x.students.push(s);
    }

    // 자습(미응시) 학생
    const waiting = subjects.length ? idx.active.filter((s) => !takers.has(s.id)) : [];
    const waitRooms = rooms.filter((r) => use.get(r.id).kind === 'empty' && r.type !== 'convenience'
      && (roles[r.id] === 'wait' || (!roles[r.id] && TT.waitAllowed(r))))
      .sort((a, b) => (a.type === 'study' ? 0 : 1) - (b.type === 'study' ? 0 : 1));
    const put = (r, s) => {
      const x = use.get(r.id);
      x.kind = 'wait';
      x.students.push({ id: s.id, subject: null });
    };
    let left = waiting.slice().sort((a, b) => byId(a.id, b.id));
    if (state.waitMode === 'own') {
      const rest = [];
      for (const s of left) {
        const r = waitRooms.find((x) => x.type === 'class' && +x.cls === s.cls);
        if (r && use.get(r.id).students.length < r.cap) put(r, s);
        else rest.push(s);
      }
      left = rest;
      for (const s of left) {
        const r = waitRooms.find((x) => use.get(x.id).students.length < x.cap && (use.get(x.id).kind === 'wait' || x.type === 'study'))
          || waitRooms.find((x) => use.get(x.id).students.length < x.cap);
        if (r) put(r, s);
        else errors.push({ code: '미응시초과', text: `${s.id} ${s.name}: 자습실 자리가 부족합니다.` });
      }
    } else if (left.length) {
      // 필요한 만큼 방을 쓰되(자습실 전용 우선), 고르게 나눔
      const totalCap = waitRooms.reduce((t, r) => t + r.cap, 0);
      if (totalCap < left.length) errors.push({ code: '미응시초과', text: `자습 학생 ${left.length}명 > 자습실 수용 ${totalCap}석. 고사실이나 자습실을 추가하세요.` });
      const target = Math.ceil(left.length / Math.max(1, waitRooms.length));
      let i = 0;
      for (const r of waitRooms) {
        const take = Math.min(r.cap, target, left.length - i);
        for (let k = 0; k < take; k++) put(r, left[i++]);
      }
      for (const r of waitRooms) while (i < left.length && use.get(r.id).students.length < r.cap) put(r, left[i++]);
    }

    // 정원 초과 (화면에서 바로 고칠 수 있도록 방·인원 정보 포함)
    for (const x of use.values()) {
      if (x.students.length > x.room.cap) {
        errors.push({
          code: x.kind === 'wait' ? '미응시초과' : '응시초과',
          text: `${x.room.name}: ${x.students.length}명 > 최대 ${x.room.cap}명 (${x.students.length - x.room.cap}명 초과)`,
          roomId: x.room.id, count: x.students.length, cap: x.room.cap,
        });
      }
    }

    // 좌석 번호
    const random = state.seatMode === 'random';
    const rand = rng(hash(key + '|' + (state.seatSeed || 1)));
    for (const x of use.values()) {
      if (x.kind === 'wait' || !random) x.students.sort((a, b) => byId(a.id, b.id));
      else {
        for (let i = x.students.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [x.students[i], x.students[j]] = [x.students[j], x.students[i]];
        }
      }
      x.students.forEach((s, i) => (s.seat = i + 1));
    }

    return {
      key,
      subjects,
      rooms: rooms.map((r) => use.get(r.id)),
      takers: takers.size,
      waiting: waiting.length,
      units,
      errors,
    };
  };

  /** 전체 교시 배치 + 학생별 색인 */
  TT.placeAll = (state, idx) => {
    const slots = [];
    const byStudent = new Map(idx.active.map((s) => [s.id, {}]));
    for (const sl of TT.slots(state)) {
      const res = TT.placeSlot(state, idx, sl.key);
      if (!res.subjects.length) continue;
      Object.assign(res, sl);
      slots.push(res);
      for (const x of res.rooms) {
        for (const s of x.students) {
          byStudent.get(s.id)[sl.key] = { roomId: x.room.id, roomName: x.room.name, kind: x.kind, subject: s.subject, seat: s.seat };
        }
      }
    }
    const errors = slots.flatMap((s) => s.errors.map((e) => ({ ...e, key: s.key })));
    return { slots, byStudent, errors };
  };
})(typeof window !== 'undefined' ? window : globalThis);
