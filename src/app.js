/* Our Home Layout Lab - local-only 2D prototype.
 * All physical dimensions and positions are stored in millimetres.
 * An SVG viewBox is only a camera; it never changes furniture dimensions.
 * The raster background is a visual reference, NOT collision geometry.
 */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
const KEY = 'home-layout-lab-public-v2:' + (typeof location !== 'undefined' ? location.pathname : '/').replace(/(?:index\.html)?$/, '');
const V1_BACKUP_KEY = KEY + '-before-v2';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = mm => mm == null ? '?' : (Math.round(mm) / 10).toLocaleString('ko-KR', {maximumFractionDigits:1});
const uid = () => 'item-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,7);
const kinds = {bed:'침대',desk:'책상',sofa:'소파',storage:'수납',mat:'매트',tv:'TV / 가전',generic:'기타 가구',zone:'비워둘 공간'};
const colors = {bed:'#b7cbdc',desk:'#bdcfc8',sofa:'#d3c4b5',storage:'#cbd0dd',mat:'#bddecf',tv:'#bbc6cb',generic:'#d4cdba',zone:'#eacb96'};
const clearance = window.HOME_CLEARANCE;
const clearanceBasisLabels = {unspecified:'근거 미지정',user:'사용자 선호 / 가정값',manufacturer:'제조사 설치 기준 (출처 입력)'};
const clearanceInputId = key => key==='front'?'f-clearance':`f-clearance-${key}`;
const clearanceSummary = f => `${clearanceBasisLabels[f.clearanceBasis??'unspecified']}${f.clearanceSource?' · '+f.clearanceSource:''}`;
const hasBody = f => [f.widthMm,f.depthMm].every(n=>Number.isFinite(n)&&n>0);
const checkKinds = {horizontal:'가로',vertical:'세로','other-room':'다른 방'};
let project = clone(window.HOME_SEED), selected = null, mode = 'select', drag = null;
let view = {x:0,y:0,w:1,h:1}, measure = [], checkDraft = null, past = [], future = [], errors = [], saveTimer;
let saveBlocked = '', recoveryRaw = null, migrationRaw = null, toastTimer, search = '', roomFilter = '', photoTarget = null;
let imageOperation = 0;
const svg = $('plan');
const MAX_IMAGE_DATA = 2500000;
function validateBackground(bg) {
  if (!bg || !['blank','upload'].includes(bg.kind) || ![bg.widthPx,bg.heightPx].every(n=>Number.isInteger(n)&&n>0&&n<=2400) || !Number.isFinite(bg.mmPerPx) || bg.mmPerPx<.1 || bg.mmPerPx>100 || !['reference','user-calibrated'].includes(bg.status)) throw Error('지원하지 않는 도면 크기 또는 축척입니다.');
  if (bg.kind==='blank' ? bg.imageData!==null : typeof bg.imageData!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(bg.imageData)||bg.imageData.length>MAX_IMAGE_DATA) throw Error('지원하지 않는 도면 이미지입니다.');
  const c=bg.calibration;
  if(c!==null && (!c || !Number.isFinite(c.lengthMm) || c.lengthMm<=0 || c.lengthMm>100000 || !Array.isArray(c.pointsPx) || c.pointsPx.length!==2 || !c.pointsPx.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[0]<=bg.widthPx&&p[1]>=0&&p[1]<=bg.heightPx) || Math.hypot(c.pointsPx[0][0]-c.pointsPx[1][0],c.pointsPx[0][1]-c.pointsPx[1][1])<1 || typeof c.note!=='string')) throw Error('축척 보정 기록이 올바르지 않습니다.');
  if((bg.status==='user-calibrated')!==(c!==null))throw Error('축척 상태와 보정 기록이 일치하지 않습니다.');
}
function decodeImage(source) {
  return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>img.naturalWidth&&img.naturalHeight?resolve(img):reject(Error('빈 이미지입니다.'));img.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));img.src=source;});
}
async function normalizePlan(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20000000)throw Error('20MB 이하 JPG, PNG, WEBP 도면을 선택하세요.');
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png=bytes.slice(0,8).join(',')==='137,80,78,71,13,10,26,10',jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255,webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(png||jpeg||webp))throw Error('PNG, JPG, WEBP 래스터 이미지만 사용할 수 있습니다.');
  const url=URL.createObjectURL(file);
  try {
    const img=await decodeImage(url),canvas=document.createElement('canvas'),scale=Math.min(1,2400/Math.max(img.naturalWidth,img.naturalHeight));
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('이미지 캔버스를 만들 수 없습니다.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    let imageData=canvas.toDataURL('image/png');
    if(imageData.length>MAX_IMAGE_DATA){
      ctx.globalCompositeOperation='destination-over';ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
      for(const quality of [.85,.7,.55,.4,.25]){imageData=canvas.toDataURL('image/jpeg',quality);if(imageData.length<=MAX_IMAGE_DATA)break;}
    }
    if(imageData.length>MAX_IMAGE_DATA)throw Error('도면 이미지가 너무 복잡합니다. 더 작은 이미지로 다시 시도하세요.');
    return {kind:'upload',widthPx:canvas.width,heightPx:canvas.height,imageData,mmPerPx:1,status:'reference',calibration:null,validationLines:[]};
  } finally {URL.revokeObjectURL(url);}
}
async function verifyPlanImage(bg) {
  validateBackground(bg);
  if(bg.imageData){const img=await decodeImage(bg.imageData);if(img.naturalWidth!==bg.widthPx||img.naturalHeight!==bg.heightPx)throw Error('도면 이미지와 저장된 크기가 다릅니다.');}
}
function workspaceRooms(bg) {
  const rooms=clone(window.HOME_SEED.rooms);rooms[0].anchorPx=[bg.widthPx/2,bg.heightPx/2];rooms[0].labelPx=[bg.widthPx/2,bg.heightPx/2];return rooms;
}
function validateProject(p) {
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const finite = (v, max=1000000) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;
  const dim = v => v === null || (finite(v,50000) && v > 0);
  const optionalText = v => v == null || typeof v === 'string';
  const optionalFlag = v => v === undefined || typeof v === 'boolean';
  if (!object(p) || ![1,2].includes(p.schemaVersion) || p.units !== 'mm' || !object(p.background) || !['blank','upload'].includes(p.background.kind) || !finite(p.background.widthPx,20000) || p.background.widthPx < 1 || !finite(p.background.heightPx,20000) || p.background.heightPx < 1 || !finite(p.background.mmPerPx,100) || p.background.mmPerPx < .1) throw Error('지원하지 않는 프로젝트 또는 축척입니다.');
  validateBackground(p.background);
  if(!Array.isArray(p.rooms)||p.rooms.length!==1||p.rooms[0]?.id!==window.HOME_SEED.rooms[0].id)throw Error('지원하지 않는 공간 목록입니다.');
  if (!Array.isArray(p.furniture) || p.furniture.length > 150 || !Array.isArray(p.scenes) || p.scenes.length !== 3) throw Error('가구 목록이나 배치안 형식이 올바르지 않습니다.');
  const ids = new Set();
  for (const f of p.furniture) {
    if (!object(f) || typeof f.id !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(f.id) || ids.has(f.id) || Object.hasOwn(Object.prototype,f.id) || f.id === 'prototype' || !Number.isInteger(f.number) || f.number<1 || f.number>10000 || typeof f.name !== 'string' || f.name.length > 150 || typeof f.kind !== 'string' || !Object.hasOwn(kinds,f.kind) || !dim(f.widthMm) || !dim(f.depthMm) || !dim(f.heightMm) || !finite(f.clearanceFrontMm,10000) || f.clearanceFrontMm < 0) throw Error('잘못된 가구 데이터가 있습니다.');
    if (![f.note,f.source,f.targetRoom,f.photo].every(optionalText) || !optionalFlag(f.verified) || !optionalFlag(f.excludeFromMove)) throw Error('잘못된 가구 설명 또는 확인 상태입니다.');
    if (f.photo && (typeof f.photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(f.photo) || f.photo.length > 1500000)) throw Error('지원하지 않는 사진 데이터입니다.');
    clearance.validate(f);
    ids.add(f.id);
  }
  const sceneIds = new Set();
  for (const s of p.scenes) {
    if (!object(s) || !['A','B','C'].includes(s.id) || sceneIds.has(s.id) || typeof s.name !== 'string' || !object(s.placements)) throw Error('잘못된 배치안입니다.');
    sceneIds.add(s.id);
    for (const [id, q] of Object.entries(s.placements)) if (!ids.has(id) || !object(q) || !finite(q.xMm) || !finite(q.yMm) || !finite(q.rotation,3600) || !optionalFlag(q.locked)) throw Error('잘못된 위치 데이터입니다.');
  }
  if (!sceneIds.has(p.activeScene)) throw Error('현재 배치안을 찾을 수 없습니다.');
  const backgroundWidth = p.background.widthPx, backgroundHeight = p.background.heightPx;
  const lines = p.background.validationLines;
  if (lines !== undefined) {
    if (!Array.isArray(lines) || lines.length > 100) throw Error('축척 검증선은 100개 이하 목록이어야 합니다.');
    const lineIds = new Set();
    for (const line of lines) {
      if (!object(line) || typeof line.id !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(line.id) || lineIds.has(line.id) || typeof line.kind !== 'string' || !Object.hasOwn(checkKinds,line.kind) || !finite(line.lengthMm,100000) || line.lengthMm <= 0 || !['unconfirmed','confirmed'].includes(line.status) || typeof line.endpointReference !== 'string' || line.endpointReference.length > 500 || typeof line.source !== 'string' || line.source.length > 500 || !(line.toleranceMm === null || (finite(line.toleranceMm,100000) && line.toleranceMm >= 0))) throw Error('축척 검증선 정보가 올바르지 않습니다.');
      if (!Array.isArray(line.pointsPx) || line.pointsPx.length !== 2 || !line.pointsPx.every(point=>Array.isArray(point)&&point.length===2&&finite(point[0],20000)&&point[0]>=0&&point[0]<=backgroundWidth&&finite(point[1],20000)&&point[1]>=0&&point[1]<=backgroundHeight) || Math.hypot(line.pointsPx[0][0]-line.pointsPx[1][0],line.pointsPx[0][1]-line.pointsPx[1][1]) < 1) throw Error('검증선 끝점은 도면 이미지 안의 서로 다른 두 점이어야 합니다.');
      if (line.status === 'confirmed' && (!line.endpointReference.trim() || !line.source.trim() || line.toleranceMm === null)) throw Error('확인 상태에는 끝점 기준, 출처, 허용 오차가 필요합니다.');
      lineIds.add(line.id);
    }
  }
  window.HOME_GEOMETRY.migrate(p);
  if(p.geometry.roomPolygons.some(r=>!window.HOME_SEED.rooms.some(room=>room.id===r.roomId)))throw Error('방 경계의 방 ID를 찾을 수 없습니다.');
  // Room-use labels remain local template data, not imported executable markup.
  p.rooms = workspaceRooms(p.background);
  return p;
}
try {
  const saved = localStorage.getItem(KEY);
  if (saved !== null) {
    try {
      const parsed=JSON.parse(saved),legacy=parsed?.schemaVersion===1;
      project=validateProject(parsed);
      if(legacy){
        recoveryRaw=saved;migrationRaw=saved;
        try{
          const backup=localStorage.getItem(V1_BACKUP_KEY);
          if(backup===null)localStorage.setItem(V1_BACKUP_KEY,saved);
          else if(backup!==saved)throw Error('다른 v1 백업이 이미 있습니다.');
        }catch(e){saveBlocked='v1 원문 백업 필요 · 자동 저장 중지 → JSON 저장 필요';}
      }
    }
    catch (e) {
      recoveryRaw = saved;
      saveBlocked = '기존 저장값 복구 필요 · 자동 저장 중지 → JSON 저장 필요';
    }
  }
} catch (e) { saveBlocked = '기존 저장값 읽기 실패 · 자동 저장 중지 → JSON 저장 필요'; }
function currentScene() { return project.scenes.find(s => s.id === project.activeScene); }
function placements() { return currentScene().placements; }
function item(id=selected) { return project.furniture.find(f => f.id === id); }
function world() { const s=project.background.mmPerPx; return {w:project.background.widthPx*s,h:project.background.heightPx*s}; }
function roomName(id) { const r=project.rooms.find(r=>r.id===id); return r ? `${r.name} / ${r.use}`.replace(/ \/ $/,'') : '미지정'; }
function snap(n) { const g=Number($('snap').value); return Math.round(g ? Math.round(n/g)*g : n); }
function notify(message) { $('toast').textContent=message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),4500); }
function checkpoint() { imageOperation++; $('export-confirmed').checked=false; past.push(clone(project)); if(past.length>35) past.shift(); future=[]; }
function writeProject() {
  if (saveBlocked) { $('save-state').textContent=saveBlocked; return; }
  try { localStorage.setItem(KEY,JSON.stringify(project)); $('save-state').textContent='이 브라우저에 저장됨'; }
  catch(e) { $('save-state').textContent='자동 저장 불가 → JSON 저장 필요'; }
}
function persist() {
  clearTimeout(saveTimer);
  if (saveBlocked) { $('save-state').textContent=saveBlocked; return; }
  $('save-state').textContent='변경 저장 중…';
  saveTimer=setTimeout(writeProject,220);
}
function commit() { $('export-confirmed').checked=false; persist(); renderAll(); }
function applyGeometry(geometry) {
 const next=clone(project);next.geometry=geometry;validateProject(next);
 checkpoint();project=next;commit();
}
const geometryEditor = window.HOME_GEOMETRY_EDITOR.create({getProject:()=>project,applyGeometry});
const doorEditor = window.HOME_DOOR_EDITOR.create({getProject:()=>project,applyGeometry});
const roomEditor = window.HOME_ROOM_EDITOR.create({getProject:()=>project,applyGeometry});
function undo() { imageOperation++; if(!past.length)return; future.push(clone(project)); project=past.pop(); selected=null; setMode('select'); fit(); commit(); }
function redo() { imageOperation++; if(!future.length)return; past.push(clone(project)); project=future.pop(); selected=null; setMode('select'); fit(); commit(); }
function point(event) { const p=new DOMPoint(event.clientX,event.clientY); return p.matrixTransform(svg.getScreenCTM().inverse()); }
function updateView() { svg.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`); }
function fit() { const {w,h}=world(); view={x:-230,y:-260,w:w+460,h:h+520}; updateView(); }
function zoom(f, p) { const {w}=world(); if(view.w*f < w*.18 || view.w*f>w*3)return; p=p||{x:view.x+view.w/2,y:view.y+view.h/2}; view={x:p.x+(view.x-p.x)*f,y:p.y+(view.y-p.y)*f,w:view.w*f,h:view.h*f}; updateView(); }
function corners(f,p) {
 const w=f.widthMm,d=f.depthMm,a=p.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 const pts=[[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]];
 return pts.map(([x,y])=>[p.xMm+x*c-y*s,p.yMm+x*s+y*c]);
}
// SAT: touching edges/corners and overlap of at most 0.5 mm on any axis are not collisions.
function overlaps(a,b) {
 for(const poly of [a,b]) for(let i=0;i<poly.length;i++) {
  const p=poly[i],q=poly[(i+1)%poly.length],dx=q[0]-p[0],dy=q[1]-p[1],norm=Math.hypot(dx,dy);
  if(norm<1e-6)continue; const ax=-dy/norm,ay=dx/norm;
  const aa=a.map(p=>p[0]*ax+p[1]*ay),bb=b.map(p=>p[0]*ax+p[1]*ay);
  if(Math.max(...aa)<=Math.min(...bb)+.5 || Math.max(...bb)<=Math.min(...aa)+.5)return false;
 }
 return true;
}
function gapTargets() {
 return [
  ...project.geometry.walls.filter(g=>g.checkEnabled).map(g=>({g,type:'wall',label:'벽',polygon:window.HOME_GEOMETRY.wallPolygon(g)})),
  ...project.geometry.fixedObstacles.filter(g=>g.checkEnabled&&hasBody(g)).map(g=>({g,type:'fixed-obstacle',label:'고정 설비',polygon:corners(g,g)}))
 ];
}
function nearestGap(id=selected) {
 const unavailable=reason=>({state:'unavailable',distanceMm:null,targetId:null,reason});
 const f=item(id),p=placements()[id];
 if(!f)return unavailable('가구를 선택하세요.');
 if(!hasBody(f))return unavailable('가구 폭/깊이 미확인 · 계산 불가');
 if(!p)return unavailable('가구 미배치 · 계산 불가');
 const body=corners(f,p);
 let best=null;
 for(const {g,type,label,polygon} of gapTargets()) {
  const gap=window.HOME_GEOMETRY.polygonGap(body,polygon);
  if(!best||gap.distanceMm<best.distanceMm||(gap.distanceMm===best.distanceMm&&gap.state==='overlap'&&best.state!=='overlap'))best={...gap,targetId:g.id,targetName:g.name,targetType:type,targetLabel:label};
 }
 return best||unavailable('계산 가능한 등록 벽/고정 설비 없음');
}
function gapValue(gap) {
 if(gap.state==='unavailable')return gap.reason;
 if(gap.state==='overlap')return '본체 겹침 · 간격 없음';
 if(gap.state==='touching')return '접촉 (0cm)';
 return gap.distanceMm<1?'분리 · < 0.1cm':`분리 · ${fmt(gap.distanceMm)}cm`;
}
function renderSelectedGap() {
 const panel=$('selected-gap');if(!panel)return;
 const gap=nearestGap(),geometry=project.geometry;
 const excluded=[...geometry.walls,...geometry.fixedObstacles].filter(g=>!g.checkEnabled).length;
 const unknown=geometry.fixedObstacles.filter(g=>!hasBody(g)).length;
 panel.className=`info${gap.state==='overlap'?' warning':''}`;
 panel.dataset.state=gap.state;
 panel.innerHTML=`<b>선택 가구의 최단 평면 간격</b><div id="selected-gap-value">${esc(gapValue(gap))}</div>${gap.targetId?`<div>대상: ${esc(gap.targetName)} (${gap.targetLabel})</div>`:''}<p class="small">본체 외곽과 등록 벽 두께/고정 설비 본체 사이 최단 직선 거리 · 연결 통로 폭 아님</p><p class="small">등록 벽 ${geometry.walls.length}개 · 고정 설비 ${geometry.fixedObstacles.length}개 중 검사 제외 ${excluded}개, 치수 미확인 ${unknown}개 제외. 숨김 대상도 계산합니다. 미등록 벽·문·방 경계·사용 여유·다른 가구는 제외하며 실제 설치/통행은 미검증입니다.</p><p class="small">입력 치수 기준 · 0.5mm 이하의 작은 겹침은 기존 충돌 알림 없이 여기에 표시될 수 있습니다.</p>`;
}
function detect() {
 const list=project.furniture.filter(f=>placements()[f.id]&&hasBody(f)); const result=[];
 const zones=new Map(list.map(f=>[f.id,clearance.zones(f,placements()[f.id])]));
 for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
  const a=list[i],b=list[j],pa=placements()[a.id],pb=placements()[b.id];
  if(overlaps(corners(a,pa),corners(b,pb))) {
   const mat=a.kind==='mat'||b.kind==='mat',zone=a.kind==='zone'||b.kind==='zone';
   result.push({ids:[a.id,b.id],hard:!mat&&!zone,text:`${a.name} ↔ ${b.name}: ${mat?'매트/놀이공간 점유':zone?'비워둘 공간과 겹침':'본체 겹침'}`});
  }
  for(const [f,g,q] of [[a,b,pb],[b,a,pa]]) if(g.kind!=='mat')for(const zone of zones.get(f.id))if(overlaps(zone.points,corners(g,q)))result.push({ids:[f.id,g.id],type:'clearance',direction:zone.key,hard:false,text:`${f.name} ${zone.label} 여유 공간 (${fmt(zone.amountMm)}cm) ↔ ${g.name} · ${clearanceSummary(f)} · 입력값 기준`});
 }
 const geometry=gapTargets();
 for(const f of list) for(const {g,type,label,polygon} of geometry) {
  for(const zone of zones.get(f.id))if(overlaps(zone.points,polygon))result.push({ids:[f.id],geometryIds:[g.id],type:'clearance',direction:zone.key,hard:false,text:`${f.name} ${zone.label} 여유 공간 (${fmt(zone.amountMm)}cm) ↔ ${g.name} (${label}) · ${clearanceSummary(f)} · 입력값 기준 · 현장 설치 판정 아님`});
  if(!overlaps(corners(f,placements()[f.id]),polygon))continue;
  const reason=f.kind==='mat'?'매트/놀이공간 점유':f.kind==='zone'?'비워둘 공간 침범':'고체 본체 충돌';
  const verification={unconfirmed:'미확인', 'plan-observed':'도면 관찰', 'field-measured':'현장 실측 입력'}[g.verification];
  result.push({ids:[f.id],geometryIds:[g.id],type,hard:!['mat','zone'].includes(f.kind),text:`${f.name} ↔ ${g.name} (${label}): ${reason} · 입력 기준 (${label} ${verification}, 가구 치수 ${f.verified?'사용자 확인':'미확인'}) · 현장 설치 판정 아님`});
 }
 for(const door of project.geometry.doors.filter(g=>g.checkEnabled)) {
  const polygon=window.HOME_DOOR_SWING.geometry(door).polygon;
  for(const f of list) {
   if(!overlaps(polygon,corners(f,placements()[f.id])))continue;
   const reason=f.kind==='mat'?'매트/놀이공간 점유':f.kind==='zone'?'비워둘 공간 침범':'고체 본체 충돌';
   result.push({ids:[f.id],geometryIds:[door.id],type:'door-swing',hard:!['mat','zone'].includes(f.kind),text:`${door.name} 문 회전 영역 ↔ ${f.name}: ${reason} · 입력 기준 · 현장 설치 판정 아님`});
  }
  for(const g of project.geometry.fixedObstacles.filter(g=>g.checkEnabled&&hasBody(g))) {
   if(overlaps(polygon,corners(g,g)))result.push({ids:[],geometryIds:[door.id,g.id],type:'door-swing',hard:true,text:`${door.name} 문 회전 영역 ↔ ${g.name} (고정 설비): 고체 본체 충돌 · 입력 기준 · 현장 설치 판정 아님`});
  }
 }
 for(const boundary of project.geometry.roomPolygons.filter(r=>r.checkEnabled)) {
  for(const f of list.filter(f=>f.targetRoom===boundary.roomId)) {
   if(window.HOME_ROOM_BOUNDARY.contains(boundary.pointsMm,corners(f,placements()[f.id])))continue;
   result.push({ids:[f.id],geometryIds:[boundary.id],type:'room-boundary',hard:!['mat','zone'].includes(f.kind),text:`${f.name} ↔ ${boundary.name}: 희망 방 경계 밖으로 본체 일부가 나감 · 입력 기준 · 실제 방/설치 판정 아님`});
  }
 }
 for(const room of project.geometry.roomPolygons)for(const zone of (room.accessZones||[]).filter(z=>z.checkEnabled)) {
  for(const f of list)if(overlaps(zone.pointsMm,corners(f,placements()[f.id])))result.push({ids:[f.id],geometryIds:[room.id,zone.id],type:'access-zone',hard:false,text:`${f.name} ↔ ${zone.name}: 수동 지정 접근 검토 구역 점유 · 필수 여유폭/실제 접근 미검증`});
 }
 return result;
}
function svgContent(exporting=false) {
 const {w,h}=world(),scale=project.background.mmPerPx,opacity=Number($('opacity').value)/100;
 const parts=[`<rect x="0" y="0" width="${w}" height="${h}" fill="#f4f7f7"/>`];
 if(project.background.imageData)parts.push(`<image href="${esc(project.background.imageData)}" x="0" y="0" width="${w}" height="${h}" opacity="${opacity}"/>`);
 if($('show-labels').checked)for(const r of project.rooms){const x=r.labelPx[0]*scale,y=r.labelPx[1]*scale,label=`${r.name}${r.use?' / '+r.use:''}`; parts.push(`<g pointer-events="none"><rect x="${x-65}" y="${y-180}" width="${label.length*148+140}" height="270" rx="50" fill="white" fill-opacity=".94"/><text x="${x}" y="${y+10}" font-family="sans-serif" font-weight="700" font-size="190" fill="#34545f">${esc(label)}</text></g>`);}
 parts.push(roomEditor.svgContent(),geometryEditor.svgContent(),doorEditor.svgContent());
 const ordered=project.furniture.filter(f=>placements()[f.id]&&f.widthMm&&f.depthMm).sort((a,b)=>({mat:0,zone:1}[a.kind]??2)-({mat:0,zone:1}[b.kind]??2));
 for(const f of ordered){
  const p=placements()[f.id],rw=f.widthMm,rh=f.depthMm,isSelected=!exporting&&f.id===selected;
  const hard=errors.some(e=>e.hard&&e.ids.includes(f.id)),soft=errors.some(e=>!e.hard&&e.ids.includes(f.id));
  const stroke=hard?'#b73f3a':isSelected?'#125e78':soft?'#ac7329':'#617986';
  const pw=(p.rotation%180===0?rw:rh),small=pw<800,font=Math.min(185,Math.max(95,pw/8));
  parts.push(`<g class="piece ${p.locked?'locked':''}" data-id="${f.id}"><g transform="translate(${p.xMm} ${p.yMm}) rotate(${p.rotation})">`);
  if($('show-clearance').checked)for(const zone of clearance.zones(f,{xMm:0,yMm:0,rotation:0})) {
   const x=zone.points.reduce((n,p)=>n+p[0],0)/4,y=zone.points.reduce((n,p)=>n+p[1],0)/4;
   parts.push(`<g data-clearance-direction="${zone.key}" pointer-events="none"><title>${esc(`${f.name} ${zone.label} 여유 ${fmt(zone.amountMm)}cm · ${clearanceSummary(f)} · 입력값 기준`)}</title><polygon points="${zone.points.map(p=>p.join(',')).join(' ')}" fill="#eacb96" fill-opacity=".15" stroke="#b2833b" stroke-dasharray="70 50" stroke-width="18"/><text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="140" fill="#8d692e">${zone.label} 여유 ${fmt(zone.amountMm)}cm</text></g>`);
  }
  parts.push(`<rect x="${-rw/2}" y="${-rh/2}" width="${rw}" height="${rh}" rx="${f.kind==='mat'?60:25}" fill="${colors[f.kind]}" fill-opacity="${f.kind==='zone'?.25:f.kind==='mat'?.5:.91}" stroke="${stroke}" stroke-width="${isSelected?42:hard?34:19}" ${f.kind==='zone'?'stroke-dasharray="80 50"':''}/>`);
  if(f.kind==='bed')parts.push(`<rect x="${-rw*.39}" y="${-rh*.43}" width="${rw*.78}" height="${rh*.18}" rx="50" fill="white" fill-opacity=".45" stroke="#829aac" stroke-width="12" pointer-events="none"/>`);
  if(f.kind==='sofa')parts.push(`<rect x="${-rw*.45}" y="${-rh*.43}" width="${rw*.9}" height="${rh*.22}" rx="30" fill="white" fill-opacity=".45" pointer-events="none"/>`);
  if(!['mat','zone'].includes(f.kind))parts.push(`<line x1="${-rw*.25}" y1="${rh/2-55}" x2="${rw*.25}" y2="${rh/2-55}" stroke="${stroke}" stroke-width="25" pointer-events="none"/>`);
  if(isSelected)parts.push(`<rect x="${-rw/2-50}" y="${-rh/2-50}" width="${rw+100}" height="${rh+100}" fill="none" stroke="#125e78" stroke-width="16" stroke-dasharray="65 50" pointer-events="none"/>`);
  const showExportLabel = !(exporting && f.excludeFromMove);
  if(showExportLabel) {
   parts.push(`</g><text x="${p.xMm}" y="${p.yMm-30}" text-anchor="middle" font-family="sans-serif" font-size="${font}" font-weight="700" fill="#203f4c" pointer-events="none">${exporting||small?String(f.number).padStart(2,'0'):esc(f.number+'. '+f.name)}</text>`);
   if(!exporting&&!small)parts.push(`<text x="${p.xMm}" y="${p.yMm+font*1.12}" text-anchor="middle" font-family="sans-serif" font-size="${font*.85}" fill="#375461" pointer-events="none">${fmt(rw)} × ${fmt(rh)} cm${p.locked?' [잠금]':''}</text>`);
  } else parts.push('</g>');
  parts.push('</g>');
 }
 if(!exporting) {
  const gap=nearestGap();
  if(gap.from&&gap.to) {
   const [a,b]=[gap.from,gap.to];
   parts.push(`<g id="selected-gap-overlay" data-state="${gap.state}" data-target-id="${esc(gap.targetId)}" pointer-events="none"><line data-from="${a.join(',')}" data-to="${b.join(',')}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#125e78" stroke-width="22" stroke-dasharray="45 25"/><circle cx="${a[0]}" cy="${a[1]}" r="30" fill="#125e78"/><circle cx="${b[0]}" cy="${b[1]}" r="30" fill="#125e78"/><text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2-70}" text-anchor="middle" font-size="140" fill="#125e78" stroke="white" stroke-width="28" paint-order="stroke">${esc(gapValue(gap))}</text></g>`);
  }
 }
 if(!exporting)for(const [i,line]of scaleLines().entries()){const [a,b]=line.pointsPx.map(p=>p.map(n=>n*scale));parts.push(`<g class="scale-check-line" pointer-events="none"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#995d16" stroke-width="22" stroke-dasharray="55 35"/><text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2-90}" text-anchor="middle" font-size="150" fill="#995d16" stroke="white" stroke-width="35" paint-order="stroke">비교 ${i+1}</text></g>`);}
 if(!exporting&&measure.length){for(const p of measure)parts.push(`<circle cx="${p.x}" cy="${p.y}" r="65" fill="#226e80" stroke="white" stroke-width="20" pointer-events="none"/>`);if(measure.length===2){const[a,b]=measure,dist=Math.hypot(a.x-b.x,a.y-b.y);parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#226e80" stroke-width="27" stroke-dasharray="80 40" pointer-events="none"/><text x="${(a.x+b.x)/2}" y="${(a.y+b.y)/2-120}" text-anchor="middle" font-family="sans-serif" font-size="200" font-weight="bold" fill="#185463" stroke="white" stroke-width="45" paint-order="stroke" pointer-events="none">${fmt(dist)} cm (현재 축척)</text>`);}}
 parts.push(`<g pointer-events="none"><line x1="${520}" y1="${h-210}" x2="${1520}" y2="${h-210}" stroke="#3c5761" stroke-width="28"/><line x1="520" y1="${h-280}" x2="520" y2="${h-140}" stroke="#3c5761" stroke-width="20"/><line x1="1520" y1="${h-280}" x2="1520" y2="${h-140}" stroke="#3c5761" stroke-width="20"/><text x="1020" y="${h-330}" text-anchor="middle" font-size="155" font-family="sans-serif" fill="#3c5761">1m | ${project.background.status==='user-calibrated'?'사용자 보정':'잠정 축척'}</text></g>`);
 return parts.join('');
}
function renderCanvas(){ errors=detect(); svg.innerHTML=svgContent(); updateView(); $('status').textContent=`${Object.keys(placements()).length}개 배치 / ${project.furniture.length}개 등록 | 겹침 알림 ${errors.length}건`; if($('onboarding'))$('onboarding').hidden=!!project.background.imageData; if($('background-status'))$('background-status').textContent=project.background.imageData?(project.background.status==='user-calibrated'?'사용자 축척 보정됨 · 현장 확인 필요':'도면 업로드됨 · 축척 보정 필요'):'도면 없음 · 이미지를 올려 시작하세요'; renderWarnings(); renderSelectedGap(); }
function renderWarnings(){
 $('warnings').innerHTML=errors.length?errors.map(e=>`<div class="warning-row ${e.hard?'hard':''}" data-warning-type="${e.type||'body'}"${e.direction?` data-clearance-direction="${e.direction}"`:''}>${esc(e.text)}</div>`).join(''):'<p class="small">검사 가능한 입력에서 겹침 알림 없음.<br>미확인·제외 대상은 검사 미완료이며 설치 가능 판정이 아닙니다.</p>';
 const status=[['walls','벽'],['fixedObstacles','고정 설비']].map(([key,label])=>{
  const objects=project.geometry[key],excluded=objects.filter(g=>!g.checkEnabled).length;
  const unknown=objects.filter(g=>g.checkEnabled&&key==='fixedObstacles'&&!hasBody(g)).length;
  return `${label} ${objects.length?'일부 등록':'미등록'}: 검사 대상 ${objects.length-excluded-unknown}개 / 제외 ${excluded}개 / 치수 미확인 ${unknown}개`;
 });
 const unknownFurniture=project.furniture.filter(f=>!hasBody(f));
 status.push(`가구 치수 미확인 ${unknownFurniture.length}개 (현재 배치 ${unknownFurniture.filter(f=>placements()[f.id]).length}개)${unknownFurniture.length ? ' · 본체 검사 미완료' : ''}`);
 const doors=project.geometry.doors,enabled=doors.filter(d=>d.checkEnabled).length,incomplete=doors.filter(d=>!window.HOME_GEOMETRY.doorOpening(d,project.geometry).linked).length;
 status.push(`여닫이문 ${doors.length?'일부 등록':'미등록'}: 검사 대상 ${enabled}개 / 제외 ${doors.length-enabled}개 / 입구 연결 미완료 ${incomplete}개`);
 const boundaries=project.geometry.roomPolygons,activeBoundaries=boundaries.filter(r=>r.checkEnabled);
 const unchecked=project.furniture.filter(f=>placements()[f.id]&&!activeBoundaries.some(r=>r.roomId===f.targetRoom)).length;
 status.push(`방 경계 ${boundaries.length?'일부 등록':'미등록'}: 검사 대상 ${activeBoundaries.length}개 / 제외 ${boundaries.length-activeBoundaries.length}개 · 희망 방 경계 없는 배치 ${unchecked}개 미검증 · 오목 경계 검증 불가`);
 const access=boundaries.flatMap(r=>r.accessZones||[]);
 if(access.length)status.push(`수동 접근 검토 구역 ${access.filter(z=>z.checkEnabled).length}개 검사 / ${access.filter(z=>!z.checkEnabled).length}개 제외 · 실제 접근 여유 미검증`);
 status.push('사용 여유는 앞·뒤·좌·우 입력값만 검사 · 0/빈칸은 미지정·검사 제외이며 안전 판정 아님');
 status.push('등록된 입력만 검사 · 숨김도 검사 유지 · 미등록 문·미닫이문·손잡이·높이·복도·반입 동선 미검증 · 설치 보증 아님');
 $('geometry-status').textContent=status.join(' · ');
}
function scaleLines(){return project.background.validationLines || [];}
function scaleResult(line){const [a,b]=line.pointsPx,measured=Math.hypot(a[0]-b[0],a[1]-b[1])*project.background.mmPerPx;return {measured,residual:measured-line.lengthMm,percent:(measured-line.lengthMm)/line.lengthMm*100};}
function renderScaleChecks(){
 const lines=scaleLines(),number=(n,digits=1)=>n.toLocaleString('ko-KR',{maximumFractionDigits:digits}),signed=(n,digits=1)=>(n>=0?'+':'')+number(n,digits);
 const checked=lines.filter(line=>line.status==='confirmed'&&line.toleranceMm!==null&&Math.abs(scaleResult(line).residual)<=line.toleranceMm);
 const covered=Object.keys(checkKinds).filter(kind=>checked.some(line=>line.kind===kind));
 const consistent=new Set(checked.map(line=>line.endpointReference.trim())).size===1;
 $('scale-checks-summary').textContent=covered.length===3&&consistent?'세 구간 비교 기록 있음 · 현장 실측 별도 확인':`교차 확인 미완료 · 확인된 구간 ${covered.length}/3`;
 $('scale-checks-list').innerHTML=lines.length?lines.map(line=>{
  const r=scaleResult(line),tolerance=line.toleranceMm===null?'허용 오차 미입력':`허용 ±${number(line.toleranceMm)} mm · ${Math.abs(r.residual)<=line.toleranceMm?'범위 안':'초과'}`;
  return `<div class="scale-check-row"><div class="row"><b>${checkKinds[line.kind]}</b><span class="badge ${line.status==='confirmed'?'':'pending'}">${line.status==='confirmed'?'출처 확인':'확인 전'}</span><button type="button" data-remove-check="${esc(line.id)}">삭제</button></div><p>현재 축척 ${number(r.measured)} mm / 알려진 길이 ${number(line.lengthMm)} mm</p><p class="check-residual">차이 ${signed(r.residual)} mm (${signed(r.percent,2)}%) · ${tolerance}</p><p>끝점 기준: ${esc(line.endpointReference)||'확인 전'}<br>출처: ${esc(line.source)||'확인 전'}</p></div>`;
 }).join(''):'<p class="small">저장된 검증선이 없습니다. 가로·세로·다른 방 구간을 각각 대조하세요.</p>';
 $('scale-check-form').hidden=!checkDraft;
}
function renderCatalog(){
 const list=project.furniture.filter(f=>(!search||f.name.includes(search))&&(!roomFilter||f.targetRoom===roomFilter));
 $('inventory-count').textContent=`${project.furniture.length}개`;
 $('catalog').innerHTML=list.map(f=>`<div class="card ${selected===f.id?'selected':''}" data-id="${f.id}" draggable="true" tabindex="0" role="button" aria-label="${esc(f.name)} 선택">${f.photo?`<img class="card-photo" src="${f.photo}" alt="${esc(f.name)}">`:`<div class="card-photo">${String(f.number).padStart(2,'0')}</div>`}<div class="card-content"><div class="card-title">${esc(f.name)}</div><div class="card-detail">${fmt(f.widthMm)} × ${fmt(f.depthMm)} cm</div><div class="card-detail">${esc(project.rooms.find(r=>r.id===f.targetRoom)?.name||'미지정')} <span class="badge ${placements()[f.id]?'':'pending'}">${placements()[f.id]?'배치됨':'미배치'}</span></div></div></div>`).join('');
}
function renderInspector(){
 const f=item(),p=f&&placements()[f.id];
 if(!f){$('inspector').innerHTML=`<div id="selected-gap"></div><div class="empty"><h2>가구를 골라 주세요</h2><p>도면 위 가구 또는 왼쪽 카드를 선택하면 치수와 사진을 수정할 수 있습니다.</p><div class="info warning">가구를 직접 추가하고 폭·깊이·사진을 입력하세요. 치수가 없는 항목은 도면에 그리지 않습니다.</div><p>현재 시작안은 빈 프로젝트이며, 사용자가 올린 입력만 저장합니다.</p></div>`;renderSelectedGap();return;}
 const cm=v=>v==null?'':Math.round(v)/10;
 $('inspector').innerHTML=`<div class="section-head"><h2>${String(f.number).padStart(2,'0')} | 가구 편집</h2><span class="badge ${f.verified?'':'pending'}">${f.verified?'사용자 확인':'치수 확인 전'}</span></div><div id="selected-gap"></div><form id="item-form" class="inspector-form"><label for="f-name">가구 이름</label><input id="f-name" value="${esc(f.name)}" maxlength="80" required><div class="field-grid"><div><label for="f-width">가로 W (cm)</label><input id="f-width" type="number" step=".1" min=".1" max="5000" value="${cm(f.widthMm)}" placeholder="확인 필요"></div><div><label for="f-depth">깊이 D (cm)</label><input id="f-depth" type="number" step=".1" min=".1" max="5000" value="${cm(f.depthMm)}" placeholder="확인 필요"></div><div><label for="f-height">높이 H (cm, 선택)</label><input id="f-height" type="number" step=".1" min=".1" max="5000" value="${cm(f.heightMm)}"></div></div><h3 style="margin-top:12px">사용 여유 (가구 기준)</h3><p class="small">앞쪽(+Y, 진한 선) 기준 앞·뒤·좌·우가 가구와 함께 회전합니다. 0/빈칸은 미지정·검사 제외이며 확보됨을 뜻하지 않습니다.</p><div class="field-grid">${clearance.directions.map(({key,field,label})=>`<div><label for="${clearanceInputId(key)}">${label} 방향 사용 여유 (cm)</label><input id="${clearanceInputId(key)}" type="number" step="any" min="0" max="1000" value="${f[field]==null?'':f[field]/10}" placeholder="미지정"></div>`).join('')}</div><label for="f-clearance-basis">네 방향 여유의 입력 근거</label><select id="f-clearance-basis">${Object.entries(clearanceBasisLabels).map(([value,label])=>`<option value="${value}" ${(f.clearanceBasis??'unspecified')===value?'selected':''}>${label}</option>`).join('')}</select><label for="f-clearance-source">여유 출처 / 가정 (제조사 기준 선택 시 필수)</label><textarea id="f-clearance-source" maxlength="500">${esc(f.clearanceSource??'')}</textarea><p class="small">입력한 값만 검사하며 제조사 기준을 자동 제공하거나 확인하지 않습니다.</p><label for="f-kind">물체 구분</label><select id="f-kind">${Object.entries(kinds).map(([id,name])=>`<option value="${id}" ${f.kind===id?'selected':''}>${name}</option>`).join('')}</select><label for="f-room">희망 방 (물리적 위치는 직접 확인)</label><select id="f-room">${project.rooms.map(r=>`<option value="${r.id}" ${f.targetRoom===r.id?'selected':''}>${esc(roomName(r.id))}</option>`).join('')}</select><label for="f-note">메모</label><textarea id="f-note" maxlength="500">${esc(f.note)}</textarea><label><input id="f-exclude-from-move" type="checkbox" ${f.excludeFromMove?'checked':''}> 이사하지 않음 (인쇄본에서 이름표 숨김)</label><label><input id="f-verified" type="checkbox" ${f.verified?'checked':''}> 치수를 내가 확인했음</label><button type="submit" class="primary" style="width:100%;margin-top:10px">치수 / 정보 적용</button><div class="source-note">${esc(f.source)}<br>짧은 진한 선은 가구의 앞쪽을 표시합니다.</div><div class="row"><button type="button" id="place">${p?'희망 방 중심으로':'도면에 놓기'}</button><button type="button" id="rotate" ${p?'':'disabled'}>90° 회전</button></div><div class="row"><button type="button" id="lock" ${p?'':'disabled'}>${p?.locked?'잠금 해제':'위치 잠금'}</button><button type="button" id="unplace" ${p?'':'disabled'}>배치 해제</button></div>${p?`<div class="info">중심 좌표 X ${fmt(p.xMm)} / Y ${fmt(p.yMm)} cm<br>회전 ${p.rotation}° | 위치는 도면 좌상단 기준</div>`:''}${f.photo?`<img class="photo-box" src="${f.photo}" alt="${esc(f.name)} 참고 사진">`:''}<div class="row"><button type="button" id="photo-upload">${f.photo?'사진 바꾸기':'가구 사진 추가'}</button>${f.photo?'<button type="button" id="photo-remove">사진 제거</button>':''}</div><div class="row"><button type="button" id="duplicate">가구 1개 더 등록</button><button type="button" class="danger" id="delete-item">목록에서 삭제</button></div></form>`;
 renderSelectedGap();
 $('item-form').onsubmit=e=>{e.preventDefault();applyForm();};
 $('place').onclick=()=>place(f.id);
 $('rotate').onclick=rotate; $('lock').onclick=()=>{if(!p)return;checkpoint();p.locked=!p.locked;commit();}; $('unplace').onclick=unplace;
 $('photo-upload').onclick=()=>{photoTarget=f.id;$('photo-file').click();};
 if($('photo-remove'))$('photo-remove').onclick=()=>{checkpoint();f.photo=null;commit();};
 $('duplicate').onclick=()=>{checkpoint();const n=clone(f);n.id=uid();n.number=Math.max(0,...project.furniture.map(f=>f.number))+1;n.name=f.name+' (추가)';project.furniture.push(n);selected=n.id;commit();};
 $('delete-item').onclick=()=>{if(!confirm(`${f.name}을 모든 배치안과 가구 목록에서 삭제할까요?`))return;checkpoint();project.furniture=project.furniture.filter(x=>x.id!==f.id);for(const s of project.scenes)delete s.placements[f.id];selected=null;commit();};
}
function applyForm(){
 const f=item();if(!f)return;
 const v=id=>$(id).value.trim()===''?null:Math.round(Number($(id).value)*10);
 const w=v('f-width'),d=v('f-depth'),h=v('f-height'),changes={};
 for(const {key,field} of clearance.directions) {
  const input=$(clearanceInputId(key));
  if(input.validity.badInput){notify('사용 여유 범위를 확인해 주세요.');return;}
  if(input.value!==input.defaultValue)changes[field]=input.value.trim()===''?(key==='front'?0:null):Number(input.value)*10;
 }
 if($('f-clearance-basis').value!==(f.clearanceBasis??'unspecified'))changes.clearanceBasis=$('f-clearance-basis').value;
 if($('f-clearance-source').value!==(f.clearanceSource??''))changes.clearanceSource=$('f-clearance-source').value;
 try{clearance.validate({...f,...changes});}catch(error){notify(error.message);return;}
 if([w,d,h].some(n=>n!==null&&(!Number.isFinite(n)||n<=0||n>50000))){notify('치수 범위를 확인해 주세요.');return;}
 checkpoint();Object.assign(f,{name:$('f-name').value.trim()||f.name,widthMm:w,depthMm:d,heightMm:h,...changes,kind:$('f-kind').value,targetRoom:$('f-room').value,note:$('f-note').value,excludeFromMove:$('f-exclude-from-move').checked,verified:$('f-verified').checked});
 if(!w||!d)for(const s of project.scenes)delete s.placements[f.id];
 commit();notify('가구 정보를 적용했습니다. 실제 크기는 모든 배치안에 함께 적용됩니다.');
}
function renderAll(){renderCanvas();renderCatalog();renderInspector();renderScaleChecks();geometryEditor.render();doorEditor.render();roomEditor.render();$('undo').disabled=!past.length;$('redo').disabled=!future.length;for(const b of document.querySelectorAll('[data-scene]'))b.classList.toggle('active',b.dataset.scene===project.activeScene);$('canvas-caption').innerHTML=`<b>${esc(currentScene().name)}</b>${mode==='crosscheck'?'원본 도면 안에서 비교할 두 끝점을 클릭하세요. 축척은 바뀌지 않습니다.':mode==='calibrate'?'길이를 아는 두 끝점을 클릭한 뒤 실제 길이를 입력하세요.':mode==='measure'?'두 점을 클릭하면 현재 축척으로 거리를 표시합니다.':mode==='pan'?'가구 위에서도 드래그해 화면 이동 · 전체 맞춤으로 가운데 정렬':'빈 도면을 드래그해 화면 이동 · 전체 맞춤으로 가운데 정렬<br>시작 스케치 / 등록 벽·설비·문 열림 검사 · 미등록 대상·동선 미검증'}`;}
function select(id){selected=id;renderAll();}
function place(id,pos){const f=item(id);if(!f)return;if(!f.widthMm||!f.depthMm){select(id);notify('가로와 깊이를 입력하고 적용한 뒤 배치해 주세요.');return;}if(placements()[id]?.locked){notify('위치 잠금을 먼저 해제하세요.');return;}checkpoint();if(!pos){const r=project.rooms.find(r=>r.id===f.targetRoom)||project.rooms[0];pos={x:r.anchorPx[0]*project.background.mmPerPx,y:r.anchorPx[1]*project.background.mmPerPx};}placements()[id]={xMm:snap(pos.x),yMm:snap(pos.y),rotation:placements()[id]?.rotation||0,locked:false};selected=id;commit();}
function rotate(){const p=placements()[selected];if(!p)return;if(p.locked){notify('위치 잠금을 먼저 해제하세요.');return;}checkpoint();p.rotation=(p.rotation+90)%360;commit();}
function unplace(){if(!placements()[selected])return;if(placements()[selected].locked){notify('위치 잠금을 먼저 해제하세요.');return;}checkpoint();delete placements()[selected];commit();}
function setMode(m){const pointerId=drag?.pointerId;mode=m;measure=[];checkDraft=null;drag=null;if(pointerId!==undefined&&svg.hasPointerCapture(pointerId))svg.releasePointerCapture(pointerId);svg.setAttribute('class','mode-'+m);for(const b of document.querySelectorAll('[data-mode]'))b.classList.toggle('active',b.dataset.mode===m);renderAll();}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0||drag)return;const p=point(e),el=e.target.closest('[data-id]'),id=el?.dataset.id;
 if(mode==='calibrate'||mode==='measure'||mode==='crosscheck'){
  if(mode==='crosscheck'&&(p.x<0||p.y<0||p.x>world().w||p.y>world().h)){notify('원본 도면 이미지 안의 점을 선택하세요.');return;}
  if(measure.length===2)measure=[];measure.push({x:p.x,y:p.y});renderCanvas();
  if(mode==='crosscheck'&&measure.length===2){
   const scale=project.background.mmPerPx;
   if(Math.hypot(measure[0].x-measure[1].x,measure[0].y-measure[1].y)<scale){notify('서로 다른 두 점을 선택하세요.');measure=[];renderCanvas();return;}
   checkDraft=measure.map(p=>[p.x/scale,p.y/scale]);$('scale-check-form').reset();$('scale-check-error').textContent='';renderScaleChecks();$('scale-checks-dialog').showModal();$('check-length').focus();
  }
  if(mode==='calibrate'&&measure.length===2){const [a,b]=measure,dist=Math.hypot(a.x-b.x,a.y-b.y);if(dist<30){notify('서로 충분히 떨어진 두 점을 선택하세요.');measure=[];return;}
   setTimeout(()=>{const raw=prompt('선택한 두 점 사이 실제 길이를 cm로 입력하세요.\n예: 거실 가로 450\n선의 끝점이 내측 벽면인지 기준축인지 구분해야 합니다.','450');if(raw===null){setMode('select');return;}const real=Number(raw)*10;if(!Number.isFinite(real)||real<=0||real>100000){notify('유효한 길이를 입력하세요.');measure=[];renderCanvas();return;}
   const old=project.background.mmPerPx,factor=real/dist,next=old*factor;if(next<.1||next>100){notify('축척 범위가 비정상입니다.');return;}checkpoint();project.background.mmPerPx=next;project.background.status='user-calibrated';project.background.calibration={lengthMm:real,pointsPx:[[a.x/old,a.y/old],[b.x/old,b.y/old]],note:'사용자가 선택한 두 점. 수직 치수 및 현장 실측은 별도 확인.'};for(const s of project.scenes)for(const q of Object.values(s.placements)){q.xMm=Math.round(q.xMm*factor);q.yMm=Math.round(q.yMm*factor);}fit();setMode('select');commit();notify('배경 축척을 바꿨습니다. 가구의 실제 가로/깊이는 유지됩니다.');},50);
  }return;
 }
 if(mode==='pan'||e.altKey||(mode==='select'&&!id)){
  if(mode==='select'&&!id&&!e.altKey){selected=null;renderAll();}
  drag={type:'pan',pointerId:e.pointerId,cx:e.clientX,cy:e.clientY,start:{...view},scale:svg.getScreenCTM().a};svg.classList.add('is-panning');svg.setPointerCapture(e.pointerId);return;
 }
 if(id){selected=id;const q=placements()[id];if(!q.locked){checkpoint();drag={type:'item',pointerId:e.pointerId,id,dx:p.x-q.xMm,dy:p.y-q.yMm};svg.setPointerCapture(e.pointerId);}renderAll();}
});
svg.addEventListener('pointermove',e=>{if(!drag||drag.pointerId!==e.pointerId)return;if(drag.type==='pan'){view={...drag.start,x:drag.start.x-(e.clientX-drag.cx)/drag.scale,y:drag.start.y-(e.clientY-drag.cy)/drag.scale};updateView();return;}const p=point(e),q=placements()[drag.id];q.xMm=snap(p.x-drag.dx);q.yMm=snap(p.y-drag.dy);renderCanvas();});
function endDrag(e){if(!drag||drag.pointerId!==e.pointerId)return;const type=drag.type;drag=null;svg.classList.remove('is-panning');if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(type==='item')commit();}
svg.addEventListener('pointerup',endDrag);svg.addEventListener('pointercancel',endDrag);svg.addEventListener('lostpointercapture',endDrag);
svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY>0?1.10:1/1.10,point(e));},{passive:false});
$('catalog').addEventListener('click',e=>{const c=e.target.closest('[data-id]');if(c)select(c.dataset.id);});
$('catalog').addEventListener('keydown',e=>{if(e.key==='Enter'){const c=e.target.closest('[data-id]');if(c)select(c.dataset.id);}});
$('catalog').addEventListener('dragstart',e=>{const c=e.target.closest('[data-id]');if(!c)return;e.dataTransfer.setData('text/plain',c.dataset.id);e.dataTransfer.effectAllowed='move';});
$('canvas-wrap').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});
$('canvas-wrap').addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(item(id))place(id,point(e));});
function add(kind='generic'){checkpoint();const f={id:uid(),number:Math.max(0,...project.furniture.map(f=>f.number))+1,name:kind==='zone'?'비워둘 공간':'새 가구',widthMm:kind==='zone'?900:null,depthMm:kind==='zone'?900:null,heightMm:null,kind,targetRoom:project.rooms[0]?.id||'',clearanceFrontMm:0,verified:false,excludeFromMove:false,source:kind==='zone'?'초기 표시 90 × 90cm, 직접 수정':'사용자 직접 입력',note:'',photo:null};project.furniture.push(f);selected=f.id;search='';$('search').value='';roomFilter='';$('room-filter').value='';commit();}
$('add-item').onclick=()=>add();$('add-zone').onclick=()=>add('zone');
$('search').oninput=e=>{search=e.target.value.trim();renderCatalog();};
$('room-filter').innerHTML+='<option disabled>────────</option>'+project.rooms.map(r=>`<option value="${r.id}">${esc(roomName(r.id))}</option>`).join('');
$('room-filter').onchange=e=>{roomFilter=e.target.value;renderCatalog();};
for(const b of document.querySelectorAll('[data-mode]'))b.onclick=()=>setMode(b.dataset.mode);
for(const b of document.querySelectorAll('[data-scene]'))b.onclick=()=>{if(project.activeScene===b.dataset.scene)return;checkpoint();project.activeScene=b.dataset.scene;selected=null;commit();};
$('clone-scene').onclick=()=>{const id=prompt('현재 배치를 복사할 안을 입력하세요: A, B, C\n대상 안의 배치는 덮어씁니다.','B')?.trim().toUpperCase();if(!id||id===project.activeScene)return;const target=project.scenes.find(s=>s.id===id);if(!target){notify('A, B, C 중 하나를 입력하세요.');return;}if(!confirm(`${project.activeScene}안을 ${id}안에 복사할까요? 기존 ${id}안 배치는 바뀝니다.`))return;checkpoint();target.placements=clone(placements());project.activeScene=id;commit();};
$('fit').onclick=fit;$('zoom-in').onclick=()=>zoom(1/1.2);$('zoom-out').onclick=()=>zoom(1.2);
$('focus').onclick=()=>{document.body.classList.toggle('focus-mode');$('focus').textContent=document.body.classList.contains('focus-mode')?'패널 보기':'크게 보기';};
for(const id of ['show-labels','show-clearance','opacity'])$(id).oninput=renderCanvas;
$('undo').onclick=undo;$('redo').onclick=redo;
$('help-button').onclick=()=>$('help').showModal();$('close-help').onclick=()=>$('help').close();
$('scale-checks-open').onclick=()=>{setMode('select');$('scale-checks-dialog').showModal();};
$('scale-checks-close').onclick=()=>{setMode('select');$('scale-checks-dialog').close();};
$('scale-checks-dialog').addEventListener('cancel',()=>setMode('select'));
$('scale-checks-pick').onclick=()=>{$('scale-checks-dialog').close();setMode('crosscheck');};
$('scale-check-form').onsubmit=e=>{
 e.preventDefault();if(!checkDraft)return;
 const line={id:uid(),kind:$('check-kind').value,pointsPx:checkDraft,lengthMm:Number($('check-length').value)*10,endpointReference:$('check-reference').value.trim(),source:$('check-source').value.trim(),status:$('check-status').value,toleranceMm:$('check-tolerance').value.trim()===''?null:Number($('check-tolerance').value)*10};
 const next=clone(project);(next.background.validationLines ||= []).push(line);
 try{validateProject(next);}catch(error){$('scale-check-error').textContent=error.message;return;}
 checkpoint();project=next;setMode('select');commit();notify('비교선을 저장했습니다. 축척과 가구 치수·위치는 유지됩니다.');
};
$('scale-checks-list').onclick=e=>{const button=e.target.closest('[data-remove-check]');if(!button)return;checkpoint();project.background.validationLines=scaleLines().filter(line=>line.id!==button.dataset.removeCheck);commit();};
$('reset').onclick=()=>{if(!confirm('도면과 모든 가구, A/B/C안, 공통 공간 객체를 빈 프로젝트로 되돌릴까요? 먼저 JSON으로 백업할 수 있습니다.'))return;checkpoint();project=clone(window.HOME_SEED);selected=null;setMode('select');fit();commit();$('help').close();};
document.addEventListener('keydown',e=>{
 if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||document.querySelector('dialog[open]'))return;
 const cmd=e.metaKey||e.ctrlKey;
 if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();return;}
 if(e.key==='Escape'){setMode('select');return;}
 if(e.key.toLowerCase()==='r'){e.preventDefault();rotate();return;}
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();unplace();return;}
 const p=placements()[selected],d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
 if(p&&d&&!p.locked){e.preventDefault();checkpoint();const step=(Number($('snap').value)||10)*(e.shiftKey?10:1);p.xMm+=d[0]*step;p.yMm+=d[1]*step;commit();}
});
function saveBlob(blob,name){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
$('recover-storage').hidden = recoveryRaw === null;
$('recover-storage').textContent = migrationRaw === null ? '복구용 원문 저장' : 'v1 이전 원문 저장';
$('recover-storage').onclick=()=>{if(recoveryRaw!==null)saveBlob(new Blob([recoveryRaw],{type:'text/plain;charset=utf-8'}),'home-layout-unreadable.txt');};
$('export-json').onclick=()=>{saveBlob(new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),'home-layout-'+project.activeScene+'-v2.json');notify('사진과 가구 목록, A/B/C 배치와 공통 공간 데이터를 포함한 v2 JSON을 저장합니다.');};
$('import-json').onclick=()=>$('json-file').click();
$('json-file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const operation=++imageOperation,original=project;
 try{
  if(file.size>15000000)throw Error('15MB 이하 프로젝트만 불러올 수 있습니다.');
  const raw=await file.text(),parsed=JSON.parse(raw),legacy=parsed?.schemaVersion===1,next=validateProject(parsed);
  await verifyPlanImage(next.background);
  if(operation!==imageOperation||original!==project)return;
  if(!confirm((legacy?'v1 파일을 v2로 이전하고 원본 백업 파일을 저장합니다.\n':'')+'현재 프로젝트를 파일 내용으로 교체할까요? 되돌리기로 복구할 수 있습니다.'))return;
  if(legacy)saveBlob(new Blob([raw],{type:'application/json'}),'home-layout-v1-before-upgrade.json');
  checkpoint();project=next;selected=null;setMode('select');fit();commit();notify('도면, 가구, 배치안을 불러왔습니다.');
 }catch(err){if(operation===imageOperation)notify('불러오기 실패: '+err.message);}
};
$('background-upload').onclick=()=>$('background-file').click();
if($('background-empty-upload'))$('background-empty-upload').onclick=()=>$('background-file').click();
$('background-file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 const operation=++imageOperation,original=project;
 if($('background-status'))$('background-status').textContent='도면 이미지를 읽는 중…';
 try{
  const background=await normalizePlan(file);
  if(operation!==imageOperation||original!==project)return;
  const existing=project.background.imageData||project.furniture.length||project.scenes.some(s=>Object.keys(s.placements).length)||['walls','fixedObstacles','doors','roomPolygons'].some(k=>project.geometry[k].length)||project.background.calibration||scaleLines().length;
  if(existing&&!confirm('새 도면으로 교체할까요? 가구 치수와 사진은 유지하고 A/B/C의 모든 배치, 벽·설비·문·방 경계와 축척 기록은 지웁니다. 되돌리기로 복구할 수 있습니다.'))return;
  const next=clone(project);next.background=background;next.rooms=workspaceRooms(background);next.geometry=clone(window.HOME_SEED.geometry);for(const scene of next.scenes)scene.placements={};
  validateProject(next);checkpoint();project=next;selected=null;setMode('select');fit();commit();notify('도면을 올렸습니다. 알고 있는 길이로 축척을 보정하세요.');
 }catch(err){if(operation===imageOperation)notify('도면 업로드 실패: '+err.message);}
 finally{if(operation===imageOperation||project!==original)renderCanvas();}
};
$('photo-file').onchange=async e=>{const file=e.target.files[0],id=photoTarget;e.target.value='';if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20000000){notify('20MB 이하 JPG, PNG, WEBP 사진을 선택하세요.');return;}const url=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const c=document.createElement('canvas'),scale=Math.min(1,640/Math.max(img.width,img.height));c.width=Math.round(img.width*scale);c.height=Math.round(img.height*scale);const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0,c.width,c.height);const f=item(id);if(f){checkpoint();f.photo=c.toDataURL('image/jpeg',.78);commit();notify('식별용 사진을 이 프로젝트에 저장했습니다. 외부로 전송하지 않습니다.');}}finally{URL.revokeObjectURL(url);}};img.onerror=()=>{URL.revokeObjectURL(url);notify('사진을 읽지 못했습니다.');};img.src=url;};
$('export-options').onclick=()=>$('export-options-dialog').showModal();
$('export-options-close').onclick=()=>$('export-options-dialog').close();
function exportSnapshot() {
 const options={gaps:$('export-gaps').checked,unknowns:$('export-unknowns').checked,confirmed:$('export-confirmed').checked,callouts:$('export-callouts').checked,nearLabels:true,a4:$('export-a4')?.checked!==false};
 const snapshot=clone(project),gaps={};
 let content=svgContent(true);
 if(options.gaps)for(const f of snapshot.furniture.filter(f=>placements()[f.id]&&!f.excludeFromMove)) {
  const gap=nearestGap(f.id),text=gap.state==='overlap'?'본체 겹침 · 0cm (간격 없음)':gapValue(gap);gaps[f.id]={...gap,text};
  if(hasBody(f)&&gap.from&&gap.to) {
   const [a,b]=[gap.from,gap.to];
   content+=`<g class="export-gap" data-id="${esc(f.id)}" data-state="${gap.state}"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="#125e78" stroke-width="22" stroke-dasharray="45 25"/><text x="${(a[0]+b[0])/2}" y="${(a[1]+b[1])/2-70}" text-anchor="middle" font-size="140" fill="#125e78" stroke="white" stroke-width="28" paint-order="stroke">${esc(f.number+' · '+text)}</text></g>`;
  }
 }
 const probe=document.createElementNS('http://www.w3.org/2000/svg','svg');
 probe.setAttribute('font-family','sans-serif');
 probe.style.cssText='position:fixed;left:-10000px;top:0;width:2200px;height:1800px;visibility:hidden;pointer-events:none';
 probe.innerHTML=content;document.body.appendChild(probe);
 let bounds;
 try {
  const box=probe.getBBox(),{w,h}=world(),pad=150;
  const x=Math.min(0,box.x)-pad,y=Math.min(0,box.y)-pad;
  bounds={x,y,w:Math.max(w,box.x+box.width)+pad-x,h:Math.max(h,box.y+box.height)+pad-y};
 } finally {probe.remove();}
 const pageWidth=options.a4?window.HOME_EXPORT_REPORT.a4Width:2200,pageHeight=options.a4?window.HOME_EXPORT_REPORT.a4Height:1800;
 const maxMapWidth=options.callouts?(options.a4?window.HOME_EXPORT_CALLOUTS.mapMaxWidthFor(pageWidth):window.HOME_EXPORT_CALLOUTS.mapMaxWidth):pageWidth;
 const factor=Math.min(maxMapWidth/bounds.w,(pageHeight-(options.a4?144:0))/bounds.h),mapWidth=Math.max(1,Math.round(bounds.w*factor)),mapHeight=Math.max(1,Math.round(bounds.h*factor));
 const text=`<svg xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" width="${mapWidth}" height="${mapHeight}" viewBox="${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}">${content}</svg>`;
 return {options,bounds,mapWidth,mapHeight,geometry:{bounds,mapWidth,mapHeight},text,report:window.HOME_EXPORT_REPORT.model(snapshot,options,gaps)};
}
$('export-png').onclick=async()=>{
 const button=$('export-png');button.disabled=true;
 let url;
 try {
  // Capture every project/option/render input synchronously before image decoding can yield.
  const snapshot=exportSnapshot(),canvas=document.createElement('canvas'),context=canvas.getContext('2d');
  if(!context)throw Error('PNG 캔버스를 만들 수 없습니다.');
  const page=snapshot.options.a4?window.HOME_EXPORT_REPORT.layoutA4(context,snapshot.report,snapshot.mapHeight,snapshot.geometry):window.HOME_EXPORT_REPORT.layout(context,snapshot.report,snapshot.mapHeight,snapshot.geometry);
  canvas.width=page.width;canvas.height=page.height;
  snapshot.text=window.HOME_EXPORT_CALLOUTS.prepareSvg(snapshot.text,page.callouts);
  url=URL.createObjectURL(new Blob([snapshot.text],{type:'image/svg+xml;charset=utf-8'}));
  const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('도면 이미지 변환 실패'));i.src=url;});
  window.HOME_EXPORT_REPORT.draw(context,page,img);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw Error('PNG 생성 실패: 브라우저 캔버스 크기/메모리 제한을 확인하세요. 내용은 잘라서 저장하지 않았습니다.');
  saveBlob(blob,`home-layout-${snapshot.report.sceneId}${snapshot.options.a4?'-a4':''}.png`);notify(snapshot.options.a4?'A4 가로 도면 중심 PNG를 저장합니다.':'상세 도면 보고서 PNG를 저장합니다. 개인 배치 JSON도 별도로 보관하세요.');
 } catch(e) {notify(e.message);} finally {if(url)URL.revokeObjectURL(url);button.disabled=false;$('export-confirmed').checked=false;}
};
// Flush pending autosave on page exit where the browser permits storage.
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);writeProject();});
window.__layoutLab={getProject:()=>clone(project),getErrors:()=>clone(errors),corners,overlaps,getView:()=>({...view}),nearestGap,exportSnapshot,place,select,rotate,undo,redo};
fit();renderAll();persist();
})();
