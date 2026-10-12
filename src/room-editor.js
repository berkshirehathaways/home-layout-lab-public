(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const textPoints=points=>points.map(p=>p.map(n=>n/10).join(', ')).join('\n');
  const fields=['name','room','points','source','verification','visible','check'];

  function create({getProject,applyGeometry}) {
    let selected=null,observed=null;
    const data=()=>getProject().geometry;
    const current=()=>data().roomPolygons.find(r=>r.id===selected);
    const error=message=>{$('room-error').textContent=message;};
    const dialog=$('rooms-dialog'),form=$('room-form');

    function fill(room) {
      $('r-room').innerHTML='<option value="">방 선택</option>'+getProject().rooms.map(r=>`<option value="${esc(r.id)}">${esc(r.name+' / '+r.use)}</option>`).join('');
      const values={name:room.name,room:room.roomId,points:textPoints(room.pointsMm),source:room.source,verification:room.verification};
      for(const [key,value] of Object.entries(values))$('r-'+key).value=value;
      $('r-visible').checked=room.visible;$('r-check').checked=room.checkEnabled;
      for(const key of fields)$('r-'+key).disabled=room.locked;
      $('r-save').disabled=room.locked;$('r-delete').disabled=!selected||room.locked;$('r-lock').disabled=!selected;
      $('r-lock').textContent=room.locked?'잠금 해제':'잠금';
      $('room-state').textContent=room.locked?'잠김 · 수정/삭제 전 잠금 해제':selected?'방 경계 수정':'새 방 경계 · 마감 내측 좌표를 입력하세요.';
      form.hidden=false;error('');
    }
    function render() {
      const geometry=data();
      $('rooms-list').innerHTML=geometry.roomPolygons.map(room=>{
        const label=getProject().rooms.find(r=>r.id===room.roomId);
        const state={unconfirmed:'확인 전','plan-observed':'도면 관찰','field-measured':'현장 실측 입력'}[room.verification];
        return `<div class="geometry-row"><button type="button" data-room-edit="${esc(room.id)}">${esc(room.name)} 편집</button><p>${esc(label?.name)} / ${esc(label?.use)} · ${room.pointsMm.length}개 꼭짓점 · ${state}</p><p>${room.visible?'표시':'숨김'} · ${room.checkEnabled?'전체 본체 포함 검사':'검사 제외'} · ${room.locked?'잠김':'편집 가능'}</p><p class="room-source">${esc(room.source||'출처 미입력')}</p>${(room.accessZones||[]).map(z=>`<p class="room-source">${esc(z.name)} · ${z.checkEnabled?'점유 검사':'검사 제외'} · ${esc(z.source)}</p>`).join('')}</div>`;
      }).join('')||'<p>등록된 방 경계가 없습니다. 방 이름과 희망 위치는 경계가 아닙니다.</p>';
      if(observed!==geometry){observed=geometry;const room=current();if(room)fill(room);else{selected=null;form.hidden=true;error('');}}
    }
    function update(change) {
      try{const next=clone(data());change(next);window.HOME_GEOMETRY.validate(next);applyGeometry(next);return true;}
      catch(err){error(err.message);return false;}
    }
    $('rooms-open').onclick=()=>{render();dialog.showModal();};
    $('rooms-close').onclick=()=>dialog.close();
    $('room-review-open').onclick=()=>$('room-review-file').click();
    $('room-review-file').onchange=async event=>{
      const file=event.target.files[0];event.target.value='';if(!file)return;
      try{
        if(file.size>3000000)throw Error('방 초안 파일은 3MB 이하로 선택하세요.');
        const draft=JSON.parse(await file.text());
        const next=window.HOME_ROOM_REVIEW.merge(getProject(),draft);
        applyGeometry(next);error('방 초안을 추가했습니다. 도면 관찰값이며 현장 실측은 미검증입니다.');
      }catch(err){error('초안 추가 실패: '+err.message);}
    };
    dialog.addEventListener('close',()=>{selected=null;form.hidden=true;error('');});
    $('room-new').onclick=()=>{selected=null;fill({name:'',roomId:'',pointsMm:[],source:'',verification:'unconfirmed',locked:false,visible:true,checkEnabled:true});$('r-name').focus();};
    $('rooms-list').onclick=event=>{const button=event.target.closest('[data-room-edit]');if(button){selected=button.dataset.roomEdit;fill(current());}};
    form.onsubmit=event=>{
      event.preventDefault();error('');const old=current();
      if(selected&&!old){error('경계를 다시 선택하세요.');return;}
      if(old?.locked){error('먼저 잠금을 해제하세요.');return;}
      try{
        const text=$('r-points').value.trim();
        const pointsMm=old&&text===textPoints(old.pointsMm)?old.pointsMm:text.split(/\n/).map(line=>{
          const values=line.trim().split(',');
          if(values.length!==2||values.some(s=>!s.trim()||!Number.isFinite(Number(s))))throw Error('각 줄에 X, Y를 cm 숫자로 입력하세요.');
          return values.map(s=>Number(s)*10);
        });
        const room={...old,id:old?.id||'room-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8),name:$('r-name').value.trim(),roomId:$('r-room').value,pointsMm,source:$('r-source').value.trim(),verification:$('r-verification').value,locked:false,visible:$('r-visible').checked,checkEnabled:$('r-check').checked};
        if(!room.name)throw Error('경계 이름을 입력하세요.');
        const previous=selected;selected=room.id;
        if(!update(next=>{if(old)next.roomPolygons[next.roomPolygons.findIndex(r=>r.id===old.id)]=room;else next.roomPolygons.push(room);next.coverage.roomPolygons='partial';}))selected=previous;
      }catch(err){error(err.message);}
    };
    $('r-lock').onclick=()=>{const room=current();if(room)update(next=>{next.roomPolygons.find(r=>r.id===room.id).locked=!room.locked;});};
    $('r-delete').onclick=()=>{const room=current();if(!room)return;if(room.locked){error('먼저 잠금을 해제하세요.');return;}update(next=>{next.roomPolygons=next.roomPolygons.filter(r=>r.id!==room.id);next.coverage.roomPolygons=next.roomPolygons.length?'partial':'unregistered';});};
    function svgContent() {
      const boundaries=`<g class="room-boundaries" pointer-events="none">${data().roomPolygons.filter(r=>r.visible).map(room=>`<g data-room-boundary-id="${esc(room.id)}"><title>${esc(room.name)} · 입력 기준 경계 · ${room.checkEnabled?'포함 검사':'검사 제외'}</title><polygon points="${room.pointsMm.map(p=>p.join(',')).join(' ')}" fill="#218071" fill-opacity=".05" stroke="#218071" stroke-width="22" stroke-dasharray="80 40"/></g>`).join('')}</g>`;
      const access=data().roomPolygons.filter(r=>r.visible).flatMap(r=>(r.accessZones||[]).filter(z=>z.visible));
      return boundaries+`<g class="access-zones" pointer-events="none">${access.map(z=>`<polygon data-access-zone-id="${esc(z.id)}" points="${z.pointsMm.map(p=>p.join(',')).join(' ')}" fill="#e2a541" fill-opacity=".25" stroke="#b87814" stroke-width="24" stroke-dasharray="40 25"><title>${esc(z.name)} · 참고 구역, 실제 접근 미검증</title></polygon>`).join('')}</g>`;
    }
    return {render,svgContent};
  }
  window.HOME_ROOM_EDITOR={create};
})();
