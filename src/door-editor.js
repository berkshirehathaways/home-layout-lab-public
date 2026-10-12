(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = value => JSON.parse(JSON.stringify(value));
  const fields = ['name','x','y','width','closed','opening','direction','source','verification','wall-a','wall-b','visible','check'];
  const dimensions = {x:'hingeXMm',y:'hingeYMm',width:'widthMm'};

  function create({getProject,applyGeometry}) {
    const dialog=$('doors-dialog'),form=$('door-form');
    let selected=null,observed=null;
    const data=()=>getProject().geometry;
    const current=()=>data().doors.find(d=>d.id===selected);
    const error=message=>{$('door-error').textContent=message;};

    function fill(door) {
      for (const key of ['wall-a','wall-b']) {
        const missing=(door.openingWallIds||[]).filter(id=>!data().walls.some(w=>w.id===id));
        $('d-'+key).innerHTML='<option value="">미연결 (미검증)</option>'+data().walls.map(w=>`<option value="${esc(w.id)}">${esc(w.name || w.id)}</option>`).join('')+missing.map(id=>`<option value="${esc(id)}">누락된 벽: ${esc(id)} (미검증)</option>`).join('');
      }
      const values={name:door.name,x:door.hingeXMm/10,y:door.hingeYMm/10,width:door.widthMm===null?'':door.widthMm/10,closed:door.closedAngleDeg,opening:door.openingAngleDeg,direction:door.swingDirection,source:door.source,verification:door.verification,'wall-a':door.openingWallIds?.[0]||'','wall-b':door.openingWallIds?.[1]||''};
      for(const [key,value] of Object.entries(values)) $('d-'+key).value=value;
      $('d-visible').checked=door.visible;$('d-check').checked=door.checkEnabled;
      for(const key of fields)$('d-'+key).disabled=door.locked;
      $('d-save').disabled=door.locked;$('d-delete').disabled=!selected||door.locked;$('d-lock').disabled=!selected;
      $('d-lock').textContent=door.locked?'잠금 해제':'잠금';
      $('door-state').textContent=door.locked?'잠김 · 수정/삭제 전 잠금 해제':selected?'문 수정':'새 여닫이문 · 실제 치수를 입력하세요.';
      form.hidden=false;error('');
    }
    function render() {
      const geometry=data();
      $('doors-list').innerHTML=geometry.doors.map(door=>`<div class="geometry-row"><button type="button" data-door-edit="${esc(door.id)}">${esc(door.name)} 편집</button><p>${door.widthMm/10}cm · ${door.visible?'표시':'숨김'} · ${door.checkEnabled?'회전 영역 검사':'검사 제외'} · ${door.locked?'잠김':'편집 가능'}</p><p>${esc(window.HOME_GEOMETRY.doorOpening(door,geometry).reason)}</p></div>`).join('')||'<p>등록된 여닫이문이 없습니다. 미등록 문·미닫이문은 미검증입니다.</p>';
      if(observed!==geometry){observed=geometry;const door=current();if(door)fill(door);else{selected=null;form.hidden=true;error('');}}
    }
    function update(change) {
      try{const next=clone(data());change(next);window.HOME_GEOMETRY.validate(next);applyGeometry(next);return true;}
      catch(err){error(err.message);return false;}
    }
    $('doors-open').onclick=()=>{render();dialog.showModal();};
    $('doors-close').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{selected=null;form.hidden=true;error('');});
    $('door-new').onclick=()=>{selected=null;fill({name:'',hingeXMm:0,hingeYMm:0,widthMm:null,closedAngleDeg:0,openingAngleDeg:90,swingDirection:'cw',source:'',verification:'unconfirmed',openingWallIds:null,locked:false,visible:true,checkEnabled:true});$('d-name').focus();};
    $('doors-list').onclick=event=>{const button=event.target.closest('[data-door-edit]');if(!button)return;selected=button.dataset.doorEdit;fill(current());};
    form.onsubmit=event=>{
      event.preventDefault();error('');const old=current();
      if(selected&&!old){error('문을 다시 선택하세요.');return;}
      if(old?.locked){error('먼저 잠금을 해제하세요.');return;}
      const mm=key=>{const input=$('d-'+key);if(input.validity.badInput||!input.value.trim())return NaN;const property=dimensions[key];return old&&input.value===String(old[property]/10)?old[property]:Number(input.value)*10;};
      const wallA=$('d-wall-a').value,wallB=$('d-wall-b').value;
      if(Boolean(wallA)!==Boolean(wallB)){error('입구 연결은 두 벽을 모두 선택하거나 모두 미연결로 두세요.');return;}
      const door={...old,id:old?.id||'door-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),kind:'hinged',name:$('d-name').value.trim(),hingeXMm:mm('x'),hingeYMm:mm('y'),widthMm:mm('width'),closedAngleDeg:Number($('d-closed').value),openingAngleDeg:Number($('d-opening').value),swingDirection:$('d-direction').value,source:$('d-source').value.trim(),verification:$('d-verification').value,openingWallIds:wallA?[wallA,wallB]:null,locked:false,visible:$('d-visible').checked,checkEnabled:$('d-check').checked};
      if(!door.name){error('문 이름을 입력하세요.');return;}
      const previous=selected;selected=door.id;
      if(!update(next=>{if(old)next.doors[next.doors.findIndex(d=>d.id===old.id)]=door;else next.doors.push(door);next.coverage.doors='partial';}))selected=previous;
    };
    $('d-lock').onclick=()=>{const door=current();if(door)update(next=>{next.doors.find(d=>d.id===door.id).locked=!door.locked;});};
    $('d-delete').onclick=()=>{const door=current();if(!door)return;if(door.locked){error('먼저 잠금을 해제하세요.');return;}update(next=>{next.doors=next.doors.filter(d=>d.id!==door.id);next.coverage.doors=next.doors.length?'partial':'unregistered';});};

    function svgContent() {
      return `<g class="doors" pointer-events="none">${data().doors.filter(d=>d.visible).map(door=>{
        const shape=window.HOME_DOOR_SWING.geometry(door),line=(points,kind,color,dash)=>`<line class="door-${kind}" x1="${points[0][0]}" y1="${points[0][1]}" x2="${points[1][0]}" y2="${points[1][1]}" stroke="${color}" stroke-width="28" ${dash?'stroke-dasharray="55 30"':''}/>`;
        return `<g data-door-id="${esc(door.id)}"><title>${esc(door.name)} · ${esc(window.HOME_GEOMETRY.doorOpening(door,data()).reason)}</title><polygon class="door-sweep" points="${shape.polygon.map(p=>p.join(',')).join(' ')}" fill="#9165ad" fill-opacity=".16"/>${line(shape.closed,'closed','#6e3b8b',false)}${line(shape.open,'open','#18786c',true)}<circle cx="${door.hingeXMm}" cy="${door.hingeYMm}" r="38" fill="#6e3b8b"/><text x="${door.hingeXMm}" y="${door.hingeYMm-100}" font-size="145" fill="#6e3b8b">문: ${esc(door.name)}</text></g>`;
      }).join('')}</g>`;
    }
    return {render,svgContent};
  }
  window.HOME_DOOR_EDITOR={create};
})();
