(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const cm = mm => mm === null ? '' : mm / 10;
  const hasBody = item => [item.widthMm, item.depthMm].every(n => Number.isFinite(n) && n > 0 && n <= 50000);
  const dimensions = {x:'xMm', y:'yMm', width:'widthMm', depth:'depthMm', x1:'x1Mm', y1:'y1Mm', x2:'x2Mm', y2:'y2Mm', thickness:'thicknessMm'};
  const fields = ['name', ...Object.keys(dimensions), 'rotation', 'source', 'verification', 'visible', 'check'];

  function create({getProject, applyGeometry}) {
    let selected = null, observed = null, type = 'fixedObstacles';
    const dialog = $('geometry-dialog'), form = $('geometry-form');
    const geometry = () => getProject().geometry;
    const current = () => geometry()[type].find(item => item.id === selected);
    const error = message => { $('geometry-error').textContent = message; };

    function fill(item) {
      const wall = type === 'walls';
      $('wall-fields').hidden = !wall;
      $('obstacle-fields').hidden = wall;
      const values = {name:item.name, source:item.source, verification:item.verification, ...(wall ? {x1:cm(item.x1Mm), y1:cm(item.y1Mm), x2:cm(item.x2Mm), y2:cm(item.y2Mm), thickness:cm(item.thicknessMm)} : {x:cm(item.xMm), y:cm(item.yMm), width:cm(item.widthMm), depth:cm(item.depthMm), rotation:item.rotation})};
      for (const [key, value] of Object.entries(values)) $('g-' + key).value = value;
      $('g-visible').checked = item.visible;
      $('g-check').checked = item.checkEnabled;
      fields.forEach(key => { $('g-' + key).disabled = item.locked; });
      $('g-save').disabled = item.locked;
      $('g-delete').disabled = !selected || item.locked;
      $('g-lock').disabled = !selected;
      $('g-lock').textContent = item.locked ? '잠금 해제' : '잠금';
      $('geometry-form-state').textContent = item.locked ? '잠김 · 수정 또는 삭제하려면 먼저 잠금을 해제하세요.' : (wall ? (selected ? '벽 구간 수정' : '새 벽 구간 · 끝점과 두께를 입력하세요.') : (selected ? '고정 설비 수정' : '새 고정 설비 · 치수를 모르면 비워 두세요.'));
      form.hidden = false;
      error('');
    }

    function render() {
      const data = geometry();
      $('geometry-list').innerHTML = ['walls', 'fixedObstacles'].map(key => data[key].map(item => {
        const wall = key === 'walls';
        const size = wall ? `길이 ${cm(Math.hypot(item.x2Mm - item.x1Mm, item.y2Mm - item.y1Mm))} / 두께 ${cm(item.thicknessMm)} cm` : (hasBody(item) ? `${cm(item.widthMm)} × ${cm(item.depthMm)} cm` : '본체 검증 불가 · 폭/깊이 확인 필요');
        return `<div class="geometry-row"><button type="button" ${wall ? 'data-wall-edit' : 'data-geometry-edit'}="${esc(item.id)}">${wall ? '벽: ' : ''}${esc(item.name || '이름 없음')} 편집</button><p>${item.locked ? '잠김' : '편집 가능'} · ${item.visible ? '표시' : '숨김'} · ${item.checkEnabled ? (wall || hasBody(item) ? '본체 검사 대상' : '치수 미확인 · 검사 미완료') : '검사 제외'}</p><p>${size}</p></div>`;
      }).join('')).join('') || '<p class="small">등록된 벽·고정 설비가 없습니다.</p>';
      if (observed !== data) {
        observed = data;
        const item = current();
        if (item) fill(item);
        else { selected = null; form.hidden = true; error(''); }
      }
    }

    function update(change) {
      try {
        const next = clone(geometry());
        change(next);
        window.HOME_GEOMETRY.validate(next);
        applyGeometry(next);
        return true;
      } catch (err) { error(err.message); return false; }
    }

    $('geometry-open').onclick = () => { render(); dialog.showModal(); };
    $('geometry-close').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { selected = null; form.hidden = true; error(''); });
    $('obstacle-new').onclick = () => {
      selected = null; type = 'fixedObstacles';
      fill({name:'', xMm:0, yMm:0, widthMm:null, depthMm:null, rotation:0, source:'', verification:'unconfirmed', locked:false, visible:true, checkEnabled:true});
      $('g-name').focus();
    };
    $('wall-new').onclick = () => {
      selected = null; type = 'walls';
      fill({name:'', x1Mm:0, y1Mm:0, x2Mm:0, y2Mm:0, thicknessMm:null, source:'', verification:'unconfirmed', locked:false, visible:true, checkEnabled:true});
      $('g-name').focus();
    };
    $('geometry-list').onclick = event => {
      const button = event.target.closest('[data-geometry-edit], [data-wall-edit]');
      if (!button) return;
      type = button.hasAttribute('data-wall-edit') ? 'walls' : 'fixedObstacles';
      selected = button.dataset.wallEdit || button.dataset.geometryEdit;
      const item = current();
      if (item) fill(item);
    };
    form.onsubmit = event => {
      event.preventDefault();
      error('');
      const old = current();
      if (selected && !old) { error('대상을 다시 선택하세요.'); return; }
      if (old?.locked) { error('먼저 잠금을 해제하세요.'); return; }
      const mm = (key, nullable = false) => {
        const input = $('g-' + key);
        if (input.validity.badInput || (!nullable && !input.value.trim())) return NaN;
        const property = dimensions[key];
        if (old && input.value === String(cm(old[property]))) return old[property];
        return input.value.trim() === '' ? null : Number(input.value) * 10;
      };
      const wall = type === 'walls';
      const shape = wall ? {x1Mm:mm('x1'), y1Mm:mm('y1'), x2Mm:mm('x2'), y2Mm:mm('y2'), thicknessMm:mm('thickness')} : {xMm:mm('x'), yMm:mm('y'), widthMm:mm('width', true), depthMm:mm('depth', true), rotation:Number($('g-rotation').value)};
      const item = {...old, ...shape, id:old?.id || (wall ? 'wall-' : 'fixed-') + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8), name:$('g-name').value.trim(), source:$('g-source').value.trim(), verification:$('g-verification').value, locked:false, visible:$('g-visible').checked, checkEnabled:$('g-check').checked};
      if (!item.name) { error('이름을 입력하세요.'); return; }
      if (!wall && [item.widthMm, item.depthMm].some(n => n !== null && (!Number.isFinite(n) || n <= 0 || n > 50000))) { error('본체 검증 불가 · 폭/깊이는 0 초과 5000cm 이하 또는 빈 값이어야 합니다.'); return; }
      if (wall && (!Number.isFinite(item.thicknessMm) || item.thicknessMm <= 0 || item.thicknessMm > 50000)) { error('벽 두께는 0 초과 5000cm 이하로 입력하세요. 미확정 두께는 등록할 수 없습니다.'); return; }
      const previous = selected;
      selected = item.id;
      if (!update(next => {
        if (old) next[type][next[type].findIndex(x => x.id === old.id)] = item;
        else next[type].push(item);
        next.coverage[type] = 'partial';
      })) selected = previous;
    };
    $('g-lock').onclick = () => {
      const item = current();
      if (item) update(next => { next[type].find(x => x.id === item.id).locked = !item.locked; });
    };
    $('g-delete').onclick = () => {
      const item = current();
      if (!item) return;
      if (item.locked) { error('먼저 잠금을 해제하세요.'); return; }
      update(next => {
        next[type] = next[type].filter(x => x.id !== item.id);
        next.coverage[type] = next[type].length ? 'partial' : 'unregistered';
      });
    };

    function svgContent() {
      const walls = `<g class="walls" pointer-events="none">${geometry().walls.filter(item => item.visible).map(item => {
        const points = window.HOME_GEOMETRY.wallPolygon(item).map(point => point.join(',')).join(' ');
        return `<g data-wall-id="${esc(item.id)}"><title>${esc(item.name)} · 벽 · ${item.checkEnabled ? '입력 기준 본체 검사' : '검사 제외'}</title><polygon points="${points}" fill="#5d7180"/><text x="${(item.x1Mm + item.x2Mm) / 2}" y="${(item.y1Mm + item.y2Mm) / 2 - item.thicknessMm / 2 - 70}" text-anchor="middle" font-family="sans-serif" font-size="145" fill="#364955">벽: ${esc(item.name)}${item.locked ? ' [잠금]' : ''}</text></g>`;
      }).join('')}</g>`;
      return walls + `<g class="fixed-obstacles" pointer-events="none">${geometry().fixedObstacles.filter(item => item.visible).map(item => {
        const body = hasBody(item);
        const shape = body ? `<rect x="${-item.widthMm / 2}" y="${-item.depthMm / 2}" width="${item.widthMm}" height="${item.depthMm}" fill="#e2caac" fill-opacity=".65" stroke="#805523" stroke-width="25" stroke-dasharray="55 25"/>` : '<path d="M -70 0 H 70 M 0 -70 V 70" stroke="#805523" stroke-width="25"/>';
        const size = body ? `${cm(item.widthMm)} × ${cm(item.depthMm)} cm` : '본체 검증 불가';
        return `<g data-geometry-id="${esc(item.id)}"><title>${esc(item.name)} · 고정 설비 · ${!item.checkEnabled ? '검사 제외' : body ? '입력 기준 본체 검사' : '치수 미확인 · 검사 미완료'}</title><g transform="translate(${item.xMm} ${item.yMm}) rotate(${item.rotation})">${shape}</g><text x="${item.xMm}" y="${item.yMm - 100}" text-anchor="middle" font-family="sans-serif" font-size="145" fill="#704519" stroke="white" stroke-width="25" paint-order="stroke">고정: ${esc(item.name)}${item.locked ? ' [잠금]' : ''}</text><text x="${item.xMm}" y="${item.yMm + 210}" text-anchor="middle" font-family="sans-serif" font-size="145" fill="#704519" stroke="white" stroke-width="25" paint-order="stroke">${size}</text></g>`;
      }).join('')}</g>`;
    }
    return {render, svgContent};
  }
  window.HOME_GEOMETRY_EDITOR = {create};
})();
