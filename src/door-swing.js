(() => {
  'use strict';
  const MAX_OVERESTIMATE_MM = 0.5;
  const finite = value => typeof value === 'number' && Number.isFinite(value);

  function validate(door) {
    if (!door || typeof door !== 'object' || Array.isArray(door) || door.kind !== 'hinged') throw Error('여닫이문만 지원합니다. 미닫이문은 미검증입니다.');
    if (![door.hingeXMm, door.hingeYMm].every(n => finite(n) && Math.abs(n) <= 1000000)) throw Error('문 경첩 좌표가 올바르지 않습니다.');
    if (!finite(door.widthMm) || door.widthMm <= 0 || door.widthMm > 50000) throw Error('문짝 폭은 확인된 양수 50000mm 이하여야 합니다.');
    if (![0, 90, 180, 270].includes(door.closedAngleDeg) || !['cw', 'ccw'].includes(door.swingDirection)) throw Error('닫힌 문 방향 또는 회전 방향이 올바르지 않습니다.');
    if (!finite(door.openingAngleDeg) || door.openingAngleDeg < 1 || door.openingAngleDeg > 90) throw Error('문 개방각은 1~90도만 지원합니다.');
    return door;
  }

  function geometry(door) {
    validate(door);
    const start = door.closedAngleDeg * Math.PI / 180;
    const sweep = door.openingAngleDeg * Math.PI / 180;
    const sign = door.swingDirection === 'cw' ? 1 : -1;
    const count = Math.max(1, Math.ceil(sweep / (2 * Math.acos(door.widthMm / (door.widthMm + MAX_OVERESTIMATE_MM)))));
    const step = sweep / count;
    const point = (angle, radius) => [door.hingeXMm + Math.cos(angle) * radius, door.hingeYMm + Math.sin(angle) * radius];
    const hinge = [door.hingeXMm, door.hingeYMm];
    const closed = point(start, door.widthMm), open = point(start + sign * sweep, door.widthMm);
    const radius = door.widthMm / Math.cos(step / 2);
    const polygon = [hinge, closed];
    // Adjacent arc tangents meet outside the circle, so the polygon contains the swept sector.
    for (let i = 0; i < count; i++) polygon.push(point(start + sign * step * (i + 0.5), radius));
    polygon.push(open);
    return {polygon, closed: [hinge, closed], open: [hinge, open], maxOverestimateMm: radius - door.widthMm};
  }

  window.HOME_DOOR_SWING = {validate, geometry};
})();
