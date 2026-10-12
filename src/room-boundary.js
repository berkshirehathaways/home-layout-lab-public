(() => {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000;
  const cross = (a, b, p) => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const onSegment = (a, b, p) => cross(a,b,p) === 0 && p[0] >= Math.min(a[0],b[0]) && p[0] <= Math.max(a[0],b[0]) && p[1] >= Math.min(a[1],b[1]) && p[1] <= Math.max(a[1],b[1]);

  function intersects(a, b, c, d) {
    const abC = cross(a,b,c), abD = cross(a,b,d), cdA = cross(c,d,a), cdB = cross(c,d,b);
    return (Math.sign(abC)*Math.sign(abD) < 0 && Math.sign(cdA)*Math.sign(cdB) < 0) ||
      onSegment(a,b,c) || onSegment(a,b,d) || onSegment(c,d,a) || onSegment(c,d,b);
  }

  function validate(pointsMm) {
    if (!Array.isArray(pointsMm) || pointsMm.length < 3 || pointsMm.length > 64) throw Error('방 경계 꼭짓점은 3~64개여야 합니다.');
    const seen = new Set();
    for (const point of pointsMm) {
      if (!Array.isArray(point) || point.length !== 2 || !finite(point[0]) || !finite(point[1])) throw Error('방 경계 좌표는 ±1,000,000mm 이내의 유한한 숫자 두 개여야 합니다.');
      const key = `${point[0]},${point[1]}`;
      if (seen.has(key)) throw Error('방 경계 꼭짓점이 중복되었습니다. 시작점은 마지막에 반복하지 않습니다.');
      seen.add(key);
    }
    const count = pointsMm.length;
    for (let i = 0; i < count; i++) for (let j = i+1; j < count; j++) {
      if (j === i+1 || (i === 0 && j === count-1)) continue;
      if (intersects(pointsMm[i],pointsMm[(i+1)%count],pointsMm[j],pointsMm[(j+1)%count])) throw Error('방 경계가 교차하거나 자기 자신과 접촉합니다.');
    }
    // Use a local origin to avoid cancellation from large absolute coordinates.
    let area = 0;
    for (let i = 1; i < count-1; i++) area += cross(pointsMm[0],pointsMm[i],pointsMm[i+1]);
    if (area === 0) throw Error('방 경계 면적은 0보다 커야 합니다.');
    const direction = Math.sign(area);
    for (let i = 0; i < count; i++) {
      const turn = cross(pointsMm[i],pointsMm[(i+1)%count],pointsMm[(i+2)%count]);
      if (turn === 0) throw Error('방 경계에 일직선으로 퇴화한 꼭짓점이 있습니다.');
      if (Math.sign(turn) !== direction) throw Error('오목 방 경계는 현재 미지원이며 검증 불가입니다. 볼록 경계만 등록할 수 있습니다.');
    }
    return pointsMm;
  }

  function distanceToSegment(point, a, b) {
    const dx = b[0]-a[0], dy = b[1]-a[1];
    const t = Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy)));
    return Math.hypot(point[0]-a[0]-t*dx,point[1]-a[1]-t*dy);
  }

  function contains(pointsMm, bodyCorners) {
    validate(pointsMm);
    if (!Array.isArray(bodyCorners) || bodyCorners.length !== 4 || !bodyCorners.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>typeof n==='number'&&Number.isFinite(n)))) throw Error('유한한 가구 본체 꼭짓점 네 개가 필요합니다.');
    validate(bodyCorners.map(p=>[p[0]-bodyCorners[0][0],p[1]-bodyCorners[0][1]]));
    const direction = Math.sign(cross(pointsMm[0],pointsMm[1],pointsMm[2]));
    // A convex boundary contains the whole body iff it contains every corner.
    // Measure tolerance to segments, avoiding excess tolerance beyond a room corner.
    return bodyCorners.every(point => {
      const inside = pointsMm.every((a,i) => direction*cross(a,pointsMm[(i+1)%pointsMm.length],point) >= 0);
      return inside || pointsMm.some((a,i) => distanceToSegment(point,a,pointsMm[(i+1)%pointsMm.length]) <= 0.5);
    });
  }

  window.HOME_ROOM_BOUNDARY = {validate, contains};
})();
