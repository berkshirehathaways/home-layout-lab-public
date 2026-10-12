(() => {
  'use strict';
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  const clone=value=>JSON.parse(JSON.stringify(value));
  function merge(project,draft) {
    if(!object(draft)||draft.kind!=='room-review'||draft.schemaVersion!==1||!project.rooms.some(r=>r.id===draft.roomId))throw Error('지원하지 않는 방 검토 초안입니다.');
    if(!object(draft.background)||draft.background.kind!==project.background.kind||!Number.isFinite(draft.background.mmPerPx)||Math.abs(draft.background.mmPerPx-project.background.mmPerPx)>1e-9)throw Error('초안 축척이 현재 도면과 다릅니다. 원본 좌표를 다시 대조하세요.');
    if(Object.hasOwn(draft,'scenes')||Object.hasOwn(draft,'furniture'))throw Error('방 초안에는 배치안이나 가구 변경을 포함할 수 없습니다.');
    window.HOME_GEOMETRY.validate(draft.geometry);
    if(draft.geometry.roomPolygons.length!==1||draft.geometry.roomPolygons[0].roomId!==draft.roomId)throw Error('초안에는 해당 방 경계 하나가 필요합니다.');
    const next=clone(project.geometry);
    for(const key of ['walls','fixedObstacles','doors','roomPolygons']) {
      if(draft.geometry[key].some(item=>item.roomId!==draft.roomId))throw Error('다른 방의 객체가 초안에 섞여 있습니다.');
      next[key].push(...clone(draft.geometry[key]));
      if(draft.geometry[key].length)next.coverage[key]='partial';
    }
    window.HOME_GEOMETRY.validate(next);
    return next;
  }
  window.HOME_ROOM_REVIEW={merge};
})();
