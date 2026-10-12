(() => {
  'use strict';
  const collections = ['walls', 'fixedObstacles', 'doors', 'roomPolygons'];
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const finite = (value, max = 1000000) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
  const dimension = value => finite(value, 50000) && value > 0;

  function validateWall(wall) {
    if (!object(wall) || !['x1Mm', 'y1Mm', 'x2Mm', 'y2Mm'].every(coord => finite(wall[coord])) || !dimension(wall.thicknessMm)) {
      throw Error('벽 끝점 좌표 또는 두께가 올바르지 않습니다.');
    }
    if (wall.x1Mm === wall.x2Mm && wall.y1Mm === wall.y2Mm) throw Error('벽 길이는 0보다 커야 합니다.');
    if (wall.x1Mm !== wall.x2Mm && wall.y1Mm !== wall.y2Mm) throw Error('사선 벽은 현재 미지원입니다. 수평/수직 벽만 등록할 수 있습니다.');
  }

  function empty() {
    return {
      schemaVersion: 1, walls: [], fixedObstacles: [], doors: [], roomPolygons: [],
      // Registration coverage says nothing about collision checks or installation safety.
      coverage: {walls: 'unregistered', fixedObstacles: 'unregistered', doors: 'unregistered', roomPolygons: 'unregistered'}
    };
  }

  function validate(geometry) {
    if (!object(geometry) || geometry.schemaVersion !== 1) throw Error('지원하지 않는 공간 기하 스키마 버전입니다.');
    for (const key of collections) {
      if (!Array.isArray(geometry[key])) throw Error(`공간 기하 ${key}는 목록이어야 합니다.`);
    }
    if (!object(geometry.coverage) || Object.keys(geometry.coverage).length !== collections.length || !collections.every(key => Object.hasOwn(geometry.coverage, key) && ['unregistered', 'partial', 'complete'].includes(geometry.coverage[key]))) {
      throw Error('공간 기하 등록 범위(coverage)가 올바르지 않습니다.');
    }
    const ids = new Set(), roomIds = new Set();
    for (const key of collections) {
      for (const item of geometry[key]) {
        if (!object(item) || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(item.id) || Object.hasOwn(Object.prototype, item.id) || item.id === 'prototype' || ids.has(item.id)) {
          throw Error('공간 객체 ID가 올바르지 않거나 중복되었습니다.');
        }
        ids.add(item.id);
        if (typeof item.name !== 'string' || typeof item.source !== 'string' || !['unconfirmed', 'plan-observed', 'field-measured'].includes(item.verification) || !['locked', 'visible', 'checkEnabled'].every(flag => typeof item[flag] === 'boolean')) {
          throw Error('공간 객체 이름, 출처, 확인 상태 또는 표시/잠금/검사 설정이 올바르지 않습니다.');
        }
        if (item.verification === 'field-measured' && !item.source.trim()) throw Error('현장 실측 확인에는 출처가 필요합니다.');
        if (key === 'fixedObstacles') {
          if (!finite(item.xMm) || !finite(item.yMm) || !(item.widthMm === null || dimension(item.widthMm)) || !(item.depthMm === null || dimension(item.depthMm)) || ![0, 90, 180, 270].includes(item.rotation)) {
            throw Error('고정 설비 좌표, 폭/깊이 또는 회전이 올바르지 않습니다.');
          }
        } else if (key === 'roomPolygons') {
          if(typeof item.roomId!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(item.roomId)||roomIds.has(item.roomId))throw Error('방 경계는 방마다 하나씩 서로 다른 방 ID로 등록하세요.');
          roomIds.add(item.roomId);
          window.HOME_ROOM_BOUNDARY.validate(item.pointsMm);
          if(item.accessZones!==undefined) {
            if(!Array.isArray(item.accessZones)||item.accessZones.length>32)throw Error('접근 검토 구역은 32개 이하 목록이어야 합니다.');
            for(const zone of item.accessZones) {
              if(!object(zone)||typeof zone.id!=='string'||!/^[a-zA-Z0-9_-]{1,90}$/.test(zone.id)||Object.hasOwn(Object.prototype,zone.id)||zone.id==='prototype'||ids.has(zone.id))throw Error('접근 검토 구역 ID가 올바르지 않거나 중복되었습니다.');
              ids.add(zone.id);
              if(typeof zone.name!=='string'||typeof zone.source!=='string'||!['unconfirmed','plan-observed','field-measured'].includes(zone.verification)||!['visible','checkEnabled'].every(flag=>typeof zone[flag]==='boolean')||(zone.verification==='field-measured'&&!zone.source.trim()))throw Error('접근 검토 구역의 출처/확인 상태/표시/검사 설정이 올바르지 않습니다.');
              window.HOME_ROOM_BOUNDARY.validate(zone.pointsMm);
            }
          }
        } else if (key === 'doors') {
          window.HOME_DOOR_SWING.validate(item);
          if (!(item.openingWallIds === null || (Array.isArray(item.openingWallIds) && item.openingWallIds.length === 2 && item.openingWallIds.every(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(id)) && item.openingWallIds[0] !== item.openingWallIds[1]))) throw Error('문 입구는 서로 다른 두 벽 ID 또는 미연결(null)이어야 합니다.');
        } else {
          validateWall(item);
        }
      }
    }
    return geometry;
  }

  // Call only on a separately parsed candidate after preserving the original backup.
  // Project-level validation remains the caller's responsibility.
  function migrate(project) {
    if (!object(project) || ![1, 2].includes(project.schemaVersion)) throw Error('지원하지 않는 프로젝트 버전입니다.');
    if (project.schemaVersion === 1) {
      if (Object.hasOwn(project, 'geometry')) throw Error('v1 프로젝트에 공간 기하가 포함되어 있어 자동 이전할 수 없습니다.');
      project.geometry = empty();
      project.schemaVersion = 2;
    } else {
      validate(project.geometry);
    }
    return project;
  }

  function wallPolygon(wall) {
    validateWall(wall);
    const half = wall.thicknessMm / 2;
    if (wall.y1Mm === wall.y2Mm) {
      const left = Math.min(wall.x1Mm, wall.x2Mm), right = Math.max(wall.x1Mm, wall.x2Mm);
      return [[left, wall.y1Mm-half], [right, wall.y1Mm-half], [right, wall.y1Mm+half], [left, wall.y1Mm+half]];
    }
    const top = Math.min(wall.y1Mm, wall.y2Mm), bottom = Math.max(wall.y1Mm, wall.y2Mm);
    return [[wall.x1Mm-half, top], [wall.x1Mm+half, top], [wall.x1Mm+half, bottom], [wall.x1Mm-half, bottom]];
  }

  // Convex polygons in mm. This numerical epsilon is separate from collision warning tolerance.
  function polygonGap(a, b) {
    const epsilon = 1e-7;
    let separated = false, touching = false;
    for (const polygon of [a, b]) {
      if (!Array.isArray(polygon) || polygon.length < 3 || !polygon.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) throw Error('간격 계산에는 유효한 볼록 다각형이 필요합니다.');
    }
    for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
      if (!length) throw Error('다각형 변의 길이는 0보다 커야 합니다.');
      const project = point => (-dy * point[0] + dx * point[1]) / length;
      const aa = a.map(project), bb = b.map(project);
      const depth = Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb));
      if (depth < -epsilon) separated = true;
      if (depth <= epsilon) touching = true;
    }
    if (!separated && !touching) return {state:'overlap', distanceMm:0, from:null, to:null};
    let distanceMm = Infinity, from = null, to = null;
    const compare = (points, edges, reverse) => {
      for (const p of points) for (let i = 0; i < edges.length; i++) {
        const q = edges[i], r = edges[(i + 1) % edges.length], dx = r[0] - q[0], dy = r[1] - q[1];
        const t = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / (dx * dx + dy * dy)));
        const nearest = [q[0] + t * dx, q[1] + t * dy], distance = Math.hypot(p[0] - nearest[0], p[1] - nearest[1]);
        if (distance < distanceMm) {
          distanceMm = distance;
          from = reverse ? nearest : [...p];
          to = reverse ? [...p] : nearest;
        }
      }
    };
    compare(a, b, false);
    compare(b, a, true);
    return {state:separated ? 'separated' : 'touching', distanceMm:separated ? distanceMm : 0, from, to};
  }

  function doorOpening(door, geometry) {
    if (!door.openingWallIds) return {linked:false, reason:'입구 미연결 · 검사 미완료'};
    const walls = door.openingWallIds.map(id => geometry.walls.find(w => w.id === id));
    if (walls.some(w => !w)) return {linked:false, reason:'연결 벽 누락 · 입구 미검증'};
    const [a,b] = walls;
    const horizontal = a.y1Mm === a.y2Mm && b.y1Mm === b.y2Mm && a.y1Mm === b.y1Mm;
    const vertical = a.x1Mm === a.x2Mm && b.x1Mm === b.x2Mm && a.x1Mm === b.x1Mm;
    if (!horizontal && !vertical) return {linked:false, reason:'같은 중심선의 수평/수직 벽 두 구간 필요'};
    const axis = horizontal ? 'x' : 'y', fixed = horizontal ? a.y1Mm : a.x1Mm;
    const spans = walls.map(w => [Math.min(w[axis+'1Mm'],w[axis+'2Mm']), Math.max(w[axis+'1Mm'],w[axis+'2Mm'])]).sort((x,y)=>x[0]-y[0]);
    const start=spans[0][1],end=spans[1][0];
    if (end <= start) return {linked:false, reason:'벽 사이 빈 입구 없음 · 벽은 자동으로 잘리지 않음'};
    const blocked=geometry.walls.filter(w=>!door.openingWallIds.includes(w.id)).some(w=>{
      const polygon=wallPolygon(w),along=polygon.map(p=>p[horizontal?0:1]),across=polygon.map(p=>p[horizontal?1:0]);
      return fixed>Math.min(...across)&&fixed<Math.max(...across)&&Math.min(end,Math.max(...along))>Math.max(start,Math.min(...along));
    });
    if(blocked)return {linked:false, reason:'다른 등록 벽이 입구를 막음 · 입구 미검증'};
    const [hinge,tip] = window.HOME_DOOR_SWING.geometry(door).closed;
    const first=horizontal?[start,fixed]:[fixed,start],second=horizontal?[end,fixed]:[fixed,end];
    const near=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<=0.5;
    const linked=(near(hinge,first)&&near(tip,second))||(near(hinge,second)&&near(tip,first));
    return {linked, reason:linked?'두 벽 사이 빈 입구 연결 (입력 기준)':'경첩·닫힌 문 끝점이 빈 입구 양 끝과 불일치 · 입구 미검증'};
  }

  window.HOME_GEOMETRY = {empty, validate, migrate, wallPolygon, polygonGap, doorOpening};
})();
